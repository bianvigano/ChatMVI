// server.js - Fitur lengkap: roles/moderasi, reactions, read receipts, search, pin, upload, invite, export, PWA
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const webpush = require('web-push');

const { connectMongo } = require('./db');
const Room = require('./models/Room');
const Message = require('./models/Message');
const Audit = require('./models/Audit');
const InviteToken = require('./models/InviteToken');

const fetchFallback = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server, { cors: { origin: false } });

// ====== CONFIG ======
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: parseInt(process.env.MAX_UPLOAD_BYTES || '') || (5 * 1024 * 1024) }, // 5MB default
});

// Optional push (konfigurasi VAPID via env)
// if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT) {
//   webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
// }

// Pastikan file model ter-load
require('./models/User');
require('./models/Session');
require('./models/PasswordResetToken');
require('./models/Room');
require('./models/RoomMember');

const { loadUser } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const passwordRoutes = require('./routes/password');
const profileRoutes = require('./routes/profile');
const roomMgmtRoutes = require('./routes/room');     // members/promote/demote
let roomsHttpRoutes = null;                          // join/create/join via backend (opsional)
try { roomsHttpRoutes = require('./routes/rooms'); } catch { /* optional */ }

// ===== App setup =====
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Helmet duluan (CSP ketat: tanpa inline)
app.use(helmet({
  // contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : undefined
  contentSecurityPolicy: false // matikan CSP dulu supaya gampang debugging
}));
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Static
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0
}));

// Logging
// app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Rate limit dasar (HTTP)
app.use('/upload', rateLimit({ windowMs: 60_000, limit: 60 }));
app.use('/search', rateLimit({ windowMs: 30_000, limit: 30 }));

// Load user (res.locals.user) sebelum routes
app.use(loadUser);

// Routes utama
if (roomsHttpRoutes) app.use(roomsHttpRoutes); // POST /join/global, /room/create, /room/join
app.use(authRoutes);        // /login /register
app.use(passwordRoutes);
app.use(profileRoutes);
app.use(roomMgmtRoutes);    // /room/:roomId/members, promote/demote

// ===== Presence in-memory =====
const presences = new Map(); // roomId -> { users: Map(socketId->username), nameToSockets: Map(username->Set), lastMsgAtByUser: Map(username->ts), tokenBuckets: Map(username->{ts, count}) }
function ensurePresence(roomId) {
  if (!presences.has(roomId)) {
    presences.set(roomId, {
      users: new Map(),
      nameToSockets: new Map(),
      lastMsgAtByUser: new Map(),
      tokenBuckets: new Map(), // untuk rate limit socket message per user
    });
  }
  return presences.get(roomId);
}
function broadcastPresence(roomId) {
  const p = presences.get(roomId);
  if (!p) return;
  io.to(roomId).emit('onlineCount', { roomId, n: p.users.size });
  io.to(roomId).emit('onlineUsers', { roomId, users: Array.from(new Set(p.users.values())) });
}

// ===== Helpers =====
async function ensureRoomDoc(roomId, owner) {
  let r = await Room.findOne({ roomId }).lean();
  if (!r) {
    r = await Room.create({ roomId, owner: owner || null, topic: '', rules: '', slowModeSec: 0 });
    r = r.toObject();
    await Audit.create({ type: 'CREATE_ROOM', roomId, actor: owner || 'system' });
  }
  return r;
}
const { Types: { ObjectId } } = require('mongoose');
function packCursor(doc) {
  if (!doc) return null;
  return Buffer.from(`${new Date(doc.createdAt).toISOString()}|${String(doc._id)}`).toString('base64');
}
function unpackCursor(c) {
  if (!c) return null;
  try {
    const [iso, id] = Buffer.from(String(c), 'base64').toString('utf8').split('|');
    return { t: new Date(iso), id: new ObjectId(id) };
  } catch { return null; }
}
const MENTION_RE = /(^|\s)@([A-Za-z0-9_]+)\b/g;
const BAD_WORDS = (process.env.BAD_WORDS || '').split(',').map(s => s.trim()).filter(Boolean);
function moderateText(s) {
  if (!BAD_WORDS.length) return { text: s, flagged: false };
  let flagged = false;
  let out = String(s || '');
  BAD_WORDS.forEach(w => {
    if (!w) return;
    const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    if (re.test(out)) { flagged = true; out = out.replace(re, '***'); }
  });
  return { text: out, flagged };
}
async function buildLinkPreview(text) {
  try {
    const m = String(text || '').match(/https?:\/\/[^\s)]+/);
    if (!m) return null;
    const url = m[0];
    const f = global.fetch || fetchFallback;
    const res = await f(url, { timeout: 5000 });
    const html = await res.text();
    const title = (html.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1];
    return { url, title: title ? title.trim() : url, image: null, description: null, siteName: null };
  } catch { return null; }
}
function canAct(room, actor, action) {
  if (!room) return false;
  if (actor === room.owner) return true;
  if (['BAN', 'UNBAN', 'KICK', 'MOD', 'UNMOD', 'PIN', 'UNPIN', 'ANNOUNCE', 'THEME'].includes(action)) {
    return room.mods?.includes(actor) || actor === room.owner;
  }
  return true;
}

const RoomMember = require('./models/RoomMember');
async function canModerate(roomId, userId) {
  const m = await RoomMember.findOne({ roomId, userId }).lean();
  return !!m && (m.role === 'owner' || m.role === 'mod');
}

// ===== Views =====
app.get('/', async (req, res) => {
  // index.ejs sudah kondisional: landing jika !user, chat jika user
  res.render('index', { title: 'Chat MVI' });
});

// ===== Messages API (cursor pagination) =====
app.get('/messages', async (req, res) => {
  try {
    const roomId = String(req.query.room || 'global');
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '50', 10)));
    const cursor = unpackCursor(req.query.cursor);
    const before = req.query.before ? new Date(req.query.before) : null;

    const q = { roomId };
    if (cursor) {
      q.$or = [{ createdAt: { $lt: cursor.t } }, { createdAt: cursor.t, _id: { $lt: cursor.id } }];
    } else if (before) {
      q.createdAt = { $lt: before };
    }

    const newestFirst = await Message.find(q).sort({ createdAt: -1, _id: -1 }).limit(limit).lean();
    const items = newestFirst.reverse();
    const nextCursor = items.length ? packCursor(items[0]) : null;
    res.json({ items, nextCursor });
  } catch {
    res.json({ items: [], nextCursor: null });
  }
});

// ===== Search API =====
app.get('/search', async (req, res) => {
  try {
    const roomId = String(req.query.room || 'global');
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ items: [] });
    const docs = await Message.find({ roomId, $text: { $search: q } })
      .sort({ createdAt: -1, _id: -1 })
      .limit(50)
      .lean();
    res.json({ items: docs });
  } catch {
    res.json({ items: [] });
  }
});

// ===== Upload API =====
app.post('/upload', upload.single('file'), (req, res) => {
  const f = req.file;
  if (!f) return res.status(400).json({ ok: false, error: 'NO_FILE' });
  // (opsional) validasi mime di sini
  res.json({ ok: true, url: `/uploads/${f.filename}`, name: f.originalname, mime: f.mimetype, size: f.size });
});

// ===== Export API =====
app.get('/export', async (req, res) => {
  try {
    const roomId = String(req.query.room || 'global');
    const format = (req.query.format || 'json').toLowerCase();
    const messages = await Message.find({ roomId }).sort({ createdAt: 1 }).lean();

    if (format === 'csv') {
      const rows = [['id', 'createdAt', 'username', 'type', 'text', 'imageUrl', 'fileUrl', 'fileName']];
      messages.forEach(m => rows.push([
        String(m._id),
        new Date(m.createdAt).toISOString(),
        m.username,
        m.type,
        (m.text || '').replace(/\n/g, '\\n').replace(/"/g, '""'),
        m.imageUrl || '',
        m.file?.url || '',
        m.file?.name || ''
      ]));
      const csv = rows.map(r => r.map(x => `"${x || ''}"`).join(',')).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="export-${roomId}.csv"`);
      return res.send(csv);
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="export-${roomId}.json"`);
    res.send(JSON.stringify(messages, null, 2));
    await Audit.create({ type: 'EXPORT', roomId, actor: 'http', meta: { format } });
  } catch {
    res.status(500).json({ ok: false });
  }
});

// ===== Invite API =====
app.post('/invite/create', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const roomId = String(req.body.room);
    const singleUse = String(req.body.singleUse || 'true') === 'true';
    const ttlSec = Math.max(60, parseInt(req.body.ttl || '3600', 10)); // default 1 jam
    const token = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + ttlSec * 1000);
    await InviteToken.create({ roomId, token, singleUse, expiresAt });
    res.json({ ok: true, token, url: `/invite/${token}` });
  } catch {
    res.json({ ok: false });
  }
});

app.get('/invite/:token', async (req, res) => {
  try {
    const it = await InviteToken.findOne({ token: req.params.token }).lean();
    if (!it) return res.status(404).send('Token tidak ditemukan');
    if (it.expiresAt && it.expiresAt < new Date()) return res.status(410).send('Token kadaluarsa');
    res.json({ ok: true, room: it.roomId, singleUse: it.singleUse, expiresAt: it.expiresAt });
  } catch {
    res.status(500).send('ERR');
  }
});

// ===== Service Worker scope (PWA) =====
// app.get('/sw.js', (req, res) => {
//   res.set('Service-Worker-Allowed', '/');
//   res.sendFile(path.join(__dirname, 'public', 'sw.js'));
// });

// Silence Chrome DevTools probe
app.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(204).end(); // No Content
});

// ===== Socket.IO Handshake: inject user & room dari cookie =====
const Session = require('./models/Session');
const User = require('./models/User');
function parseCookies(raw = '') {
  const out = {};
  raw.split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}


io.use(async (socket, next) => {
  try {
    const cookies = parseCookies(socket.request.headers.cookie || '');
    const sid = cookies.sid || null;           // session id (dibuat saat login)
    const rid = cookies.rid || 'global';       // room id (diset via /join/global)

    let user = null;
    if (sid) {
      // ambil session -> user
      // Jika model kamu bernama lain, sesuaikan field-nya (token/userId)
      const sess = await Session.findOne({ token: sid }).lean();
      if (sess?.userId) {
        user = await User.findById(sess.userId).lean();
      }
    }

    socket.data.user     = user || null;
    socket.data.username = user?.username || 'guest';
    socket.data.roomId   = rid;

    console.log('[SOCKET] handshake:',
      'sid:', sid ? 'ada' : '-',
      '| rid:', socket.data.roomId,
      '| username:', socket.data.username
    );

    next();
  } catch (err) {
    console.error('[SOCKET] handshake error:', err);
    next(err);
  }
});

// ===== Socket.IO =====
io.on('connection', (socket) => {
  console.log('[SOCKET] connection: username =', socket.data?.username || '(guest)', 'roomId =', socket.data?.roomId);
  let current = { roomId: null, username: null };

  function socketRateLimit(roomId, username) {
    const p = ensurePresence(roomId);
    const bucket = p.tokenBuckets.get(username) || { ts: Date.now(), count: 0 };
    const now = Date.now();
    if (now - bucket.ts > 5000) { bucket.ts = now; bucket.count = 0; }
    bucket.count += 1;
    p.tokenBuckets.set(username, bucket);
    const limit = parseInt(process.env.SOCKET_MSG_PER_5S || '10', 10);
    return bucket.count <= limit;
  }

  async function joinRoom(roomId, username) {
    // leave old
    if (current.roomId) {
      const prevP = presences.get(current.roomId);
      if (prevP) {
        prevP.users.delete(socket.id);
        const set = prevP.nameToSockets.get(current.username);
        if (set) { set.delete(socket.id); if (!set.size) prevP.nameToSockets.delete(current.username); }
        socket.leave(current.roomId);
        broadcastPresence(current.roomId);
      }
    }

    const r = await ensureRoomDoc(roomId, null);

    // banned?
    if (r.bannedUsers?.includes(username)) {
      socket.emit('history', { items: [], nextCursor: null });
      return;
    }

    current = { roomId, username };
    const p = ensurePresence(roomId);
    p.users.set(socket.id, username);
    if (!p.nameToSockets.has(username)) p.nameToSockets.set(username, new Set());
    p.nameToSockets.get(username).add(socket.id);
    socket.join(roomId);

    const newestFirst = await Message.find({ roomId }).sort({ createdAt: -1, _id: -1 }).limit(50).lean();
    const items = newestFirst.reverse();
    const nextCursor = items.length ? packCursor(items[0]) : null;

    const roomInfo = await Room.findOne({ roomId }, { topic: 1, rules: 1, slowModeSec: 1, theme: 1, pinnedMessageIds: 1, announcements: 1 }).lean();
    const pins = roomInfo?.pinnedMessageIds?.length ? await Message.find({ _id: { $in: roomInfo.pinnedMessageIds } }).lean() : [];

    socket.emit('history', { items, nextCursor });
    socket.emit('roomInfo', { topic: roomInfo?.topic || '', rules: roomInfo?.rules || '', slowModeSec: roomInfo?.slowModeSec || 0, theme: roomInfo?.theme || { mode: 'light' }, pins, announcements: roomInfo?.announcements || [] });
    broadcastPresence(roomId);
  }

  // === AUTO-JOIN berdasar cookie (tanpa JS inline) ===
  const initialUsername = socket.data.username || 'guest';
  const initialRoomId = socket.data.roomId || 'global';
  joinRoom(initialRoomId, initialUsername);

  // (Masih dipertahankan untuk kompatibilitas frontend lama)
  socket.on('joinGlobal', async ({ username }) => {
    if (!username) return;
    await ensureRoomDoc('global', null);
    joinRoom('global', username);
  });

  socket.on('createRoom', async ({ roomId, password, username }, cb) => {
    try {
      if (!roomId || !password || !username) return cb?.({ ok: false, error: 'INVALID' });
      const exists = await Room.findOne({ roomId }).lean();
      if (exists) return cb?.({ ok: false, error: 'Room sudah ada' });

      const rounds = Math.max(4, parseInt(process.env.BCRYPT_ROUNDS || '10', 10) || 10);
      const passwordHash = await bcrypt.hash(String(password), rounds);

      await Room.create({ roomId, passwordHash, owner: username, topic: '', rules: '' });
      await Audit.create({ type: 'CREATE_ROOM', roomId, actor: username });
      await joinRoom(roomId, username);
      cb?.({ ok: true });
    } catch { cb?.({ ok: false, error: 'ERR' }); }
  });

  // JOIN: dukung password atau invite token
  socket.on('joinRoom', async ({ roomId, password, username, inviteToken }, cb) => {
    try {
      const r = await Room.findOne({ roomId }).select('+password +passwordHash').lean();
      if (!r) return cb?.({ ok: false, error: 'Room tidak ada' });
      if (!username) return cb?.({ ok: false, error: 'Username wajib' });
      if (r.bannedUsers?.includes(username)) return cb?.({ ok: false, error: 'Kamu diblokir' });

      // Invite token bypass password
      if (inviteToken) {
        const it = await InviteToken.findOne({ token: inviteToken, roomId }).lean();
        if (!it) return cb?.({ ok: false, error: 'Token invalid' });
        if (it.expiresAt && it.expiresAt < new Date()) return cb?.({ ok: false, error: 'Token kadaluarsa' });
        if (it.singleUse && it.usedAt) return cb?.({ ok: false, error: 'Token sudah dipakai' });
        // mark used (best-effort)
        await InviteToken.updateOne({ token: inviteToken }, { $set: { usedAt: new Date() } });
        await joinRoom(roomId, username);
        return cb?.({ ok: true });
      }

      const pass = String(password || '');
      let ok = false;
      if (r.passwordHash) {
        ok = await bcrypt.compare(pass, r.passwordHash);
      } else if (r.password) {
        ok = pass === r.password;
        if (ok) {
          const rounds = Math.max(4, parseInt(process.env.BCRYPT_ROUNDS || '10', 10) || 10);
          const passwordHash = await bcrypt.hash(pass, rounds);
          await Room.updateOne({ roomId }, { $set: { passwordHash }, $unset: { password: 1 } });
        }
      }
      if (!ok) return cb?.({ ok: false, error: 'Password salah' });

      await joinRoom(roomId, username);
      cb?.({ ok: true });
    } catch { cb?.({ ok: false, error: 'ERR' }); }
  });

  socket.on('leaveRoom', () => {
    if (!current.roomId) return;
    const p = presences.get(current.roomId);
    if (p) {
      p.users.delete(socket.id);
      const set = p.nameToSockets.get(current.username);
      if (set) { set.delete(socket.id); if (!set.size) p.nameToSockets.delete(current.username); }
      broadcastPresence(current.roomId);
    }
    socket.leave(current.roomId);
    current = { roomId: null, username: null };
  });

  // Typing
  socket.on('typing', ({ isTyping }) => {
    if (!current.roomId || !current.username) return;
    socket.to(current.roomId).emit('typing', { username: current.username, isTyping: !!isTyping });
  });

  // Slow mode + socket RL
  async function slowModeCheck(roomId, username) {
    const p = ensurePresence(roomId);
    const secDoc = await Room.findOne({ roomId }, { slowModeSec: 1 }).lean();
    const sec = secDoc?.slowModeSec || 0;
    if (sec <= 0) return { ok: true };
    const last = p.lastMsgAtByUser.get(username);
    const now = Date.now();
    if (last && (now - last) < sec * 1000) {
      return { ok: false, waitMs: sec * 1000 - (now - last), seconds: sec };
    }
    p.lastMsgAtByUser.set(username, now);
    return { ok: true };
  }

  // Kirim pesan
  socket.on('messageRoom', async (payload, cb) => {
    try {
      const { roomId, username } = current;
      if (!roomId || !username) return cb?.({ ok: false });

      // rate limit & slow mode
      if (!socketRateLimit(roomId, username)) return cb?.({ ok: false, error: 'RATE_LIMIT' });
      const slow = await slowModeCheck(roomId, username);
      if (!slow.ok) return cb?.({ ok: false, error: 'SLOW_MODE' });

      const room = await Room.findOne({ roomId }).lean();
      if (room.bannedUsers?.includes(username)) return cb?.({ ok: false, error: 'BANNED' });

      let parent = null;
      if (payload.parentId) {
        const pm = await Message.findById(payload.parentId).lean();
        if (pm) {
          parent = { _id: String(pm._id), id: String(pm._id), username: pm.username, text: pm.text, createdAt: pm.createdAt };
        }
      }

      // file/image
      if (payload.imageUrl) {
        const msgDoc = await Message.create({ roomId, username, type: 'image', imageUrl: String(payload.imageUrl), parent });
        io.to(roomId).emit('message', msgDoc.toObject());
        return cb?.({ ok: true });
      }
      if (payload.file) {
        const msgDoc = await Message.create({ roomId, username, type: 'file', file: payload.file, parent });
        io.to(roomId).emit('message', msgDoc.toObject());
        return cb?.({ ok: true });
      }

      // text (moderasi + link preview)
      const original = String(payload.text || '').slice(0, 4000);
      const { text, flagged } = moderateText(original);
      const linkPreview = await buildLinkPreview(text);

      const msgDoc = await Message.create({ roomId, username, type: 'text', text, parent, linkPreview, flagged });
      const msg = msgDoc.toObject();
      io.to(roomId).emit('message', msg);

      // mentions
      const p = ensurePresence(roomId);
      const mentioned = new Set();
      (text.match(MENTION_RE) || []).forEach((m) => {
        const name = m.trim().slice(1);
        if (name && p.nameToSockets.has(name)) {
          p.nameToSockets.get(name).forEach((sid) => {
            if (!mentioned.has(sid)) io.to(sid).emit('mention', { from: username, text });
            mentioned.add(sid);
          });
        }
      });

      cb?.({ ok: true });
    } catch { cb?.({ ok: false }); }
  });

  // Edit/Hapus + history
  socket.on('editMessage', async ({ id, newText }, cb) => {
    try {
      const { roomId, username } = current;
      if (!roomId || !username) return cb?.({ ok: false });
      const m = await Message.findOne({ _id: id, roomId, type: 'text' });
      if (!m) return cb?.({ ok: false, error: 'NOT_FOUND' });
      if (m.username !== username) return cb?.({ ok: false, error: 'FORBIDDEN' });

      // simpan history
      if (m.text) m.editHistory.push({ text: m.text, editedAt: new Date() });
      const moderated = moderateText(String(newText || '').slice(0, 4000));
      m.text = moderated.text;
      m.flagged = moderated.flagged;
      m.editedAt = new Date();
      m.linkPreview = await buildLinkPreview(m.text);
      await m.save();

      io.to(roomId).emit('messageEdited', { id: String(m._id), newText: m.text, editedAt: m.editedAt, linkPreview: m.linkPreview, reactions: m.reactions ? Object.fromEntries(m.reactions) : undefined, seenBy: m.seenBy });
      await Audit.create({ type: 'EDIT', roomId, actor: username, meta: { id } });
      cb?.({ ok: true });
    } catch { cb?.({ ok: false }); }
  });

  socket.on('deleteMessage', async ({ id }, cb) => {
    try {
      const msg = await Message.findById(id);
      if (!msg) return cb?.({ ok: false, error: 'NOT_FOUND' });

      const roomId = msg.roomId || 'global';
      const isSelf = msg.username === socket.data.username;

      if (!isSelf) {
        const userId = socket.data.user?._id;
        if (!userId || !(await canModerate(roomId, userId))) {
          return cb?.({ ok: false, error: 'FORBIDDEN' });
        }
      }

      await Message.deleteOne({ _id: id });
      io.to(roomId).emit('messageDeleted', { id });
      cb?.({ ok: true });
    } catch (e) {
      cb?.({ ok: false, error: 'ERR' });
    }
  });

  // Reactions
  socket.on('reactMessage', async ({ id, emoji }, cb) => {
    try {
      const { roomId, username } = current;
      if (!roomId || !username || !emoji) return cb?.({ ok: false });
      const m = await Message.findOne({ _id: id, roomId });
      if (!m) return cb?.({ ok: false, error: 'NOT_FOUND' });
      if (!m.reactions) m.reactions = new Map();
      const cur = new Set(m.reactions.get(emoji) || []);
      if (cur.has(username)) cur.delete(username); else cur.add(username);
      m.reactions.set(emoji, Array.from(cur));
      await m.save();
      io.to(roomId).emit('messageEdited', { id: String(m._id), newText: m.text, editedAt: m.editedAt, linkPreview: m.linkPreview, reactions: Object.fromEntries(m.reactions), seenBy: m.seenBy });
      cb?.({ ok: true });
    } catch { cb?.({ ok: false }); }
  });

  // Read receipts
  socket.on('seenUpTo', async ({ lastId }, cb) => {
    try {
      const { roomId, username } = current;
      if (!roomId || !username || !lastId) return cb?.({ ok: false });
      const pivot = await Message.findOne({ _id: lastId, roomId }, { createdAt: 1, _id: 1 }).lean();
      if (!pivot) return cb?.({ ok: false });
      await Message.updateMany(
        { roomId, $or: [{ createdAt: { $lt: pivot.createdAt } }, { createdAt: pivot.createdAt, _id: { $lte: pivot._id } }] },
        { $addToSet: { seenBy: username } }
      );
      cb?.({ ok: true });
    } catch { cb?.({ ok: false }); }
  });

  // Slash commands (roles/moderasi, pin, rules, topic, slow, theme, invite)
  socket.on('slash', async ({ cmd, args }, cb) => {
    try {
      const { roomId, username } = current;
      if (!roomId || !username) return cb?.({ ok: false, error: 'NOT_IN_ROOM' });
      const room = await Room.findOne({ roomId });
      const c = String(cmd || '').toLowerCase();

      if (c === 'giphy') {
        const q = (args && args[0]) ? String(args.join(' ')) : 'funny cat';
        const KEY = process.env.GIPHY_API_KEY || '';
        let gifUrl = `https://giphy.com/search/${encodeURIComponent(q)}`;
        if (KEY) {
          try {
            const url = `https://api.giphy.com/v1/gifs/search?api_key=${KEY}&q=${encodeURIComponent(q)}&limit=1&rating=g`;
            const rGif = await (global.fetch || fetchFallback)(url).then(r => r.json());
            gifUrl = rGif?.data?.[0]?.images?.downsized_medium?.url || gifUrl;
          } catch { }
        }
        const msgDoc = await Message.create({ roomId, username, type: 'image', imageUrl: gifUrl });
        io.to(roomId).emit('message', msgDoc.toObject());
        return cb?.({ ok: true });
      }

      if (c === 'topic') {
        const topic = String((args || []).join(' ')).slice(0, 500);
        if (!canAct(room, username, 'ANNOUNCE')) return cb?.({ ok: false, error: 'FORBIDDEN' });
        room.topic = topic; await room.save();
        io.to(roomId).emit('roomInfo', { topic: room.topic, rules: room.rules, slowModeSec: room.slowModeSec, theme: room.theme, pins: [], announcements: room.announcements });
        return cb?.({ ok: true });
      }

      if (c === 'rules') {
        const rules = String((args || []).join(' ')).slice(0, 1000);
        if (!canAct(room, username, 'ANNOUNCE')) return cb?.({ ok: false, error: 'FORBIDDEN' });
        room.rules = rules; await room.save();
        io.to(roomId).emit('roomInfo', { topic: room.topic, rules: room.rules, slowModeSec: room.slowModeSec, theme: room.theme, pins: [], announcements: room.announcements });
        return cb?.({ ok: true });
      }

      if (c === 'slow') {
        if (!canAct(room, username, 'ANNOUNCE')) return cb?.({ ok: false, error: 'FORBIDDEN' });
        const sec = Math.max(0, parseInt(args?.[0] || '0', 10) || 0);
        room.slowModeSec = sec; await room.save();
        io.to(roomId).emit('slowMode', { seconds: sec, waitMs: sec * 1000 });
        return cb?.({ ok: true });
      }

      if (c === 'theme') {
        if (!canAct(room, username, 'THEME')) return cb?.({ ok: false, error: 'FORBIDDEN' });
        const mode = (args?.[0] || '').toLowerCase(); // 'dark'/'light'
        if (mode === 'dark' || mode === 'light') room.theme.mode = mode;
        const accent = args?.[1]; if (accent) room.theme.accent = accent;
        await room.save();
        io.to(roomId).emit('roomInfo', { topic: room.topic, rules: room.rules, slowModeSec: room.slowModeSec, theme: room.theme, pins: [], announcements: room.announcements });
        return cb?.({ ok: true });
      }

      if (c === 'announce') {
        if (!canAct(room, username, 'ANNOUNCE')) return cb?.({ ok: false, error: 'FORBIDDEN' });
        const text = String((args || []).join(' ')).slice(0, 500);
        room.announcements.push({ text, createdAt: new Date() });
        await room.save();
        io.to(roomId).emit('roomInfo', { topic: room.topic, rules: room.rules, slowModeSec: room.slowModeSec, theme: room.theme, pins: [], announcements: room.announcements });
        return cb?.({ ok: true });
      }

      if (c === 'pin' || c === 'unpin') {
        if (!canAct(room, username, 'PIN')) return cb?.({ ok: false, error: 'FORBIDDEN' });
        const id = args?.[0];
        if (!id) return cb?.({ ok: false, error: 'BAD_ARG' });
        if (c === 'pin') {
          if (!room.pinnedMessageIds.includes(id)) room.pinnedMessageIds.push(id);
          await Audit.create({ type: 'PIN', roomId, actor: username, meta: { id } });
        } else {
          room.pinnedMessageIds = room.pinnedMessageIds.filter(x => x !== id);
          await Audit.create({ type: 'UNPIN', roomId, actor: username, meta: { id } });
        }
        await room.save();
        const pins = room.pinnedMessageIds.length ? await Message.find({ _id: { $in: room.pinnedMessageIds } }).lean() : [];
        io.to(roomId).emit('roomInfo', { topic: room.topic, rules: room.rules, slowModeSec: room.slowModeSec, theme: room.theme, pins, announcements: room.announcements });
        return cb?.({ ok: true });
      }

      if (c === 'ban' || c === 'unban' || c === 'kick') {
        if (!canAct(room, username, 'BAN')) return cb?.({ ok: false, error: 'FORBIDDEN' });
        const target = (args?.[0] || '').trim();
        if (!target) return cb?.({ ok: false, error: 'BAD_ARG' });
        if (c === 'ban') {
          if (!room.bannedUsers.includes(target)) room.bannedUsers.push(target);
          await room.save();
          await Audit.create({ type: 'BAN', roomId, actor: username, target });
          // putuskan socket target bila online
          const p = ensurePresence(roomId);
          p.nameToSockets.get(target)?.forEach(sid => io.sockets.sockets.get(sid)?.leave(roomId));
        } else if (c === 'unban') {
          room.bannedUsers = room.bannedUsers.filter(u => u !== target); await room.save();
          await Audit.create({ type: 'UNBAN', roomId, actor: username, target });
        } else if (c === 'kick') {
          const p = ensurePresence(roomId);
          p.nameToSockets.get(target)?.forEach(sid => io.sockets.sockets.get(sid)?.leave(roomId));
          await Audit.create({ type: 'KICK', roomId, actor: username, target });
        }
        return cb?.({ ok: true });
      }

      if (c === 'mod' || c === 'unmod') {
        if (username !== room.owner) return cb?.({ ok: false, error: 'OWNER_ONLY' });
        const target = (args?.[0] || '').trim();
        if (!target) return cb?.({ ok: false, error: 'BAD_ARG' });
        if (c === 'mod') {
          if (!room.mods.includes(target)) room.mods.push(target);
          await room.save(); await Audit.create({ type: 'MOD', roomId, actor: username, target });
        } else {
          room.mods = room.mods.filter(u => u !== target);
          await room.save(); await Audit.create({ type: 'UNMOD', roomId, actor: username, target });
        }
        return cb?.({ ok: true });
      }

      if (c === 'invite') {
        const singleUse = true;
        const token = crypto.randomBytes(16).toString('hex');
        const expiresAt = new Date(Date.now() + 3600 * 1000);
        await InviteToken.create({ roomId, token, singleUse, expiresAt });
        return cb?.({ ok: true, token, url: `/invite/${token}` });
      }

      if (c === 'export') {
        // hanya owner/mod
        if (!canAct(room, username, 'ANNOUNCE')) return cb?.({ ok: false, error: 'FORBIDDEN' });
        await Audit.create({ type: 'EXPORT', roomId, actor: username, meta: { via: 'slash' } });
        return cb?.({ ok: true, url: `/export?room=${encodeURIComponent(roomId)}&format=json` });
      }

      // /tr <lang> <teks>  (opsional jika LIBRETRANSLATE_URL tersedia)
      if (c === 'tr') {
        const LT = process.env.LIBRETRANSLATE_URL;
        if (!LT) return cb?.({ ok: false, error: 'NO_TRANSLATE' });
        const lang = (args?.[0] || 'en').toLowerCase();
        const text = String(args?.slice(1).join(' ') || '').trim();
        if (!text) return cb?.({ ok: false, error: 'BAD_ARG' });
        try {
          const res = await (global.fetch || fetchFallback)(`${LT}/translate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ q: text, source: 'auto', target: lang, format: 'text' })
          }).then(r => r.json());
          const msgDoc = await Message.create({ roomId, username, type: 'text', text: `**Terjemahan (${lang})**: ${res?.translatedText || '(gagal)'}` });
          io.to(roomId).emit('message', msgDoc.toObject());
          return cb?.({ ok: true });
        } catch { return cb?.({ ok: false }); }
      }

      return cb?.({ ok: false, error: 'UNKNOWN' });
    } catch { cb?.({ ok: false, error: 'ERR' }); }
  });

  // Kirim file dari client setelah /upload
  socket.on('sendFile', async ({ file }, cb) => {
    try {
      const { roomId, username } = current;
      if (!roomId || !username || !file?.url) return cb?.({ ok: false });
      const msgDoc = await Message.create({ roomId, username, type: 'file', file });
      io.to(roomId).emit('message', msgDoc.toObject());
      cb?.({ ok: true });
    } catch { cb?.({ ok: false }); }
  });

  // Disconnect
  socket.on('disconnect', () => {
    if (!current.roomId) return;
    const p = presences.get(current.roomId);
    if (p) {
      p.users.delete(socket.id);
      const set = p.nameToSockets.get(current.username);
      if (set) { set.delete(socket.id); if (!set.size) p.nameToSockets.delete(current.username); }
      broadcastPresence(current.roomId);
    }
  });
});

// ===== Start =====
const PORT = process.env.PORT || 3000;
connectMongo().then(async () => {
  await ensureRoomDoc('global', null);
  server.listen(PORT, () => console.log(`✅ Chat full-feature running on http://localhost:${PORT}`));
}).catch((err) => {
  console.error('Mongo connection error:', err);
  process.exit(1);
});
