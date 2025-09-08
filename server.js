// server.js (Mongo/Mongoose version)
require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');
const { connectMongo } = require('./db');
const Room = require('./models/Room');
const Message = require('./models/Message');

// gunakan fetch bawaan Node >=18; fallback ke node-fetch jika perlu
const fetchFallback = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server, { cors: { origin: false } });

// ===== Middlewares & static =====
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(helmet());
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
}));

// ===== In-memory presence (untuk online count, slow mode timer) =====
// Data chat tetap disimpan di Mongo; presence & throttle tersimpan di memori.
const presences = new Map();
// format: presences.get(roomId) = { users: Map(socketId->username), nameToSockets: Map(username->Set(socketId)), lastMsgAtByUser: Map(username->timestamp) }

function ensurePresence(roomId) {
  if (!presences.has(roomId)) {
    presences.set(roomId, {
      users: new Map(),
      nameToSockets: new Map(),
      lastMsgAtByUser: new Map(),
    });
  }
  return presences.get(roomId);
}

function broadcastPresence(roomId) {
  const p = presences.get(roomId);
  if (!p) return;
  const onlineCount = p.users.size;
  const onlineUsers = Array.from(new Set(p.users.values()));
  io.to(roomId).emit('onlineCount', { roomId, n: onlineCount });
  io.to(roomId).emit('onlineUsers', { roomId, users: onlineUsers });
}

async function ensureRoomDoc(roomId, password = null) {
  let r = await Room.findOne({ roomId }).lean();
  if (!r) {
    r = await Room.create({ roomId, password, topic: '', rules: '', slowModeSec: 0 });
    r = r.toObject();
  }
  return r;
}

const MENTION_RE = /(^|\s)@([A-Za-z0-9_]+)\b/g;

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

// ===== Routes =====
app.get('/', (req, res) => res.render('index', { title: 'Chat MVI' }));

// Timeline paginasi via DB
app.get('/messages', async (req, res) => {
  try {
    const roomId = String(req.query.room || 'global');
    const before = req.query.before ? new Date(req.query.before) : null;
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '50', 10)));

    const q = { roomId };
    if (before) q.createdAt = { $lt: before };

    // ambil newest dulu, batasi, lalu urutkan ke ascending supaya tampil rapi
    const newestFirst = await Message.find(q).sort({ createdAt: -1 }).limit(limit).lean();
    const list = newestFirst.reverse();

    res.json(list);
  } catch (e) {
    res.json([]);
  }
});

// ===== Socket.IO =====
io.on('connection', (socket) => {
  let current = { roomId: null, username: null };

  async function joinRoom(roomId, username) {
    // keluar dari room lama
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

    // pastikan dokumen room
    const roomDoc = await ensureRoomDoc(roomId, null);

    current = { roomId, username };
    const p = ensurePresence(roomId);
    p.users.set(socket.id, username);
    if (!p.nameToSockets.has(username)) p.nameToSockets.set(username, new Set());
    p.nameToSockets.get(username).add(socket.id);
    socket.join(roomId);

    // kirim history terakhir 50 (ascending)
    const newestFirst = await Message.find({ roomId }).sort({ createdAt: -1 }).limit(50).lean();
    socket.emit('history', newestFirst.reverse());
    socket.emit('roomInfo', { topic: roomDoc.topic || '', rules: roomDoc.rules || '', slowModeSec: roomDoc.slowModeSec || 0 });
    broadcastPresence(roomId);
  }

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
      await Room.create({ roomId, password, topic: '', rules: '' });
      await joinRoom(roomId, username);
      cb?.({ ok: true });
    } catch (e) {
      cb?.({ ok: false, error: 'ERR' });
    }
  });

  socket.on('joinRoom', async ({ roomId, password, username }, cb) => {
    try {
      const r = await Room.findOne({ roomId }).lean();
      if (!r) return cb?.({ ok: false, error: 'Room tidak ada' });
      if (!password || r.password !== password) return cb?.({ ok: false, error: 'Password salah' });
      if (!username) return cb?.({ ok: false, error: 'Username wajib' });
      await joinRoom(roomId, username);
      cb?.({ ok: true });
    } catch (e) {
      cb?.({ ok: false, error: 'ERR' });
    }
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

  socket.on('typing', ({ isTyping }) => {
    if (!current.roomId || !current.username) return;
    socket.to(current.roomId).emit('typing', { username: current.username, isTyping: !!isTyping });
  });

  async function slowModeCheck(roomId, username) {
    const p = ensurePresence(roomId);
    const roomDoc = await Room.findOne({ roomId }, { slowModeSec: 1 }).lean();
    const sec = roomDoc?.slowModeSec || 0;
    if (sec <= 0) return { ok: true };
    const last = p.lastMsgAtByUser.get(username);
    const now = Date.now();
    if (last && (now - last) < sec * 1000) {
      return { ok: false, waitMs: sec * 1000 - (now - last), seconds: sec };
    }
    p.lastMsgAtByUser.set(username, now);
    return { ok: true };
  }

  socket.on('messageRoom', async (payload, cb) => {
    try {
      const { roomId, username } = current;
      if (!roomId || !username) return cb?.({ ok: false });

      const slow = await slowModeCheck(roomId, username);
      if (!slow.ok) return cb?.({ ok: false, error: 'SLOW_MODE' });

      let parent = null;
      if (payload.parentId) {
        const pm = await Message.findById(payload.parentId).lean();
        if (pm) {
          parent = { _id: String(pm._id), id: String(pm._id), username: pm.username, text: pm.text, createdAt: pm.createdAt };
        }
      }

      // image message
      if (payload.imageUrl) {
        const msgDoc = await Message.create({
          roomId, username, type: 'image', imageUrl: String(payload.imageUrl),
          parent,
        });
        io.to(roomId).emit('message', msgDoc.toObject());
        return cb?.({ ok: true });
      }

      // text message
      const text = String(payload.text || '').slice(0, 4000);
      const linkPreview = await buildLinkPreview(text);
      const msgDoc = await Message.create({
        roomId, username, type: 'text', text, parent, linkPreview,
      });
      const msg = msgDoc.toObject();
      io.to(roomId).emit('message', msg);

      // mention notify
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
    } catch (e) {
      cb?.({ ok: false });
    }
  });

  socket.on('editMessage', async ({ id, newText }, cb) => {
    try {
      const { roomId, username } = current;
      if (!roomId || !username) return cb?.({ ok: false });
      const m = await Message.findOne({ _id: id, roomId, type: 'text' });
      if (!m) return cb?.({ ok: false, error: 'NOT_FOUND' });
      if (m.username !== username) return cb?.({ ok: false, error: 'FORBIDDEN' });

      m.text = String(newText || '').slice(0, 4000);
      m.editedAt = new Date();
      m.linkPreview = await buildLinkPreview(m.text);
      await m.save();

      io.to(roomId).emit('messageEdited', { id: String(m._id), newText: m.text, editedAt: m.editedAt, linkPreview: m.linkPreview });
      cb?.({ ok: true });
    } catch (e) {
      cb?.({ ok: false });
    }
  });

  socket.on('deleteMessage', async ({ id }, cb) => {
    try {
      const { roomId, username } = current;
      if (!roomId || !username) return cb?.({ ok: false });
      const m = await Message.findOne({ _id: id, roomId });
      if (!m) return cb?.({ ok: false, error: 'NOT_FOUND' });
      if (m.username !== username) return cb?.({ ok: false, error: 'FORBIDDEN' });
      await Message.deleteOne({ _id: id });
      io.to(roomId).emit('messageDeleted', { id: String(id) });
      cb?.({ ok: true });
    } catch (e) {
      cb?.({ ok: false });
    }
  });

  socket.on('createPoll', async ({ question, options }, cb) => {
    try {
      const { roomId, username } = current;
      if (!roomId || !username) return cb?.({ ok: false });

      const poll = {
        question: String(question || '').slice(0, 300),
        options: (options || []).slice(0, 10).map(t => ({ text: String(t).slice(0, 200), votes: [] })),
        isClosed: false,
      };
      if (poll.options.length < 2) return cb?.({ ok: false, error: 'MIN_OPTIONS' });

      const msgDoc = await Message.create({
        roomId, username, type: 'poll', poll,
      });
      io.to(roomId).emit('message', msgDoc.toObject());
      cb?.({ ok: true });
    } catch (e) {
      cb?.({ ok: false });
    }
  });

  socket.on('votePoll', async ({ id, optionIndex }, cb) => {
    try {
      const { roomId, username } = current;
      const m = await Message.findOne({ _id: id, roomId, type: 'poll' });
      if (!m || m.poll?.isClosed) return cb?.({ ok: false, error: 'CLOSED' });

      const i = parseInt(optionIndex, 10);
      const opt = m.poll?.options?.[i];
      if (!opt) return cb?.({ ok: false, error: 'BAD_INDEX' });

      // hapus vote lama user
      m.poll.options.forEach(o => { o.votes = o.votes.filter(u => u !== username); });
      // tambahkan vote baru
      opt.votes.push(username);

      m.markModified('poll');
      await m.save();
      io.to(roomId).emit('pollUpdated', { id: String(m._id), poll: m.poll });
      cb?.({ ok: true });
    } catch (e) {
      cb?.({ ok: false });
    }
  });

  socket.on('closePoll', async ({ id }, cb) => {
    try {
      const { roomId, username } = current;
      const m = await Message.findOne({ _id: id, roomId, type: 'poll' });
      if (!m || m.username !== username) return cb?.({ ok: false, error: 'FORBIDDEN' });
      m.poll.isClosed = true;
      m.markModified('poll');
      await m.save();
      io.to(roomId).emit('pollUpdated', { id: String(m._id), poll: m.poll });
      cb?.({ ok: true });
    } catch (e) {
      cb?.({ ok: false });
    }
  });

  socket.on('slash', async ({ cmd, args }, cb) => {
    try {
      const { roomId, username } = current;
      if (!roomId || !username) return cb?.({ ok: false, error: 'NOT_IN_ROOM' });

      const c = String(cmd || '').toLowerCase();
      if (c === 'giphy') {
        const q = (args && args[0]) ? String(args.join(' ')) : 'funny cat';
        const KEY = process.env.GIPHY_API_KEY || '';
        let gifUrl = `https://giphy.com/search/${encodeURIComponent(q)}`;
        if (KEY) {
          try {
            const url = `https://api.giphy.com/v1/gifs/search?api_key=${KEY}&q=${encodeURIComponent(q)}&limit=1&rating=g`;
            const rGif = await (global.fetch || fetchFallback)(url).then(r => r.json());
            const data = rGif?.data?.[0];
            gifUrl = data?.images?.downsized_medium?.url || gifUrl;
          } catch {}
        }
        const msgDoc = await Message.create({ roomId, username, type: 'image', imageUrl: gifUrl });
        io.to(roomId).emit('message', msgDoc.toObject());
        return cb?.({ ok: true });
      }

      if (c === 'topic') {
        const topic = String((args || []).join(' ')).slice(0, 500);
        const r = await Room.findOneAndUpdate({ roomId }, { $set: { topic } }, { new: true, upsert: true, projection: { topic: 1, rules: 1, slowModeSec: 1 } });
        io.to(roomId).emit('roomInfo', { topic: r.topic || '', rules: r.rules || '', slowModeSec: r.slowModeSec || 0 });
        return cb?.({ ok: true });
      }

      if (c === 'rules') {
        const rules = String((args || []).join(' ')).slice(0, 1000);
        const r = await Room.findOneAndUpdate({ roomId }, { $set: { rules } }, { new: true, upsert: true, projection: { topic: 1, rules: 1, slowModeSec: 1 } });
        io.to(roomId).emit('roomInfo', { topic: r.topic || '', rules: r.rules || '', slowModeSec: r.slowModeSec || 0 });
        return cb?.({ ok: true });
      }

      if (c === 'slow') {
        const sec = Math.max(0, parseInt(args?.[0] || '0', 10) || 0);
        const r = await Room.findOneAndUpdate({ roomId }, { $set: { slowModeSec: sec } }, { new: true, upsert: true, projection: { slowModeSec: 1 } });
        io.to(roomId).emit('slowMode', { seconds: r.slowModeSec || 0, waitMs: (r.slowModeSec || 0) * 1000 });
        return cb?.({ ok: true });
      }

      return cb?.({ ok: false, error: 'UNKNOWN' });
    } catch (e) {
      cb?.({ ok: false, error: 'ERR' });
    }
  });

  socket.on('sendImage', async ({ imageUrl }, cb) => {
    try {
      const { roomId, username } = current;
      if (!roomId || !username || !imageUrl) return cb?.({ ok: false });
      const msgDoc = await Message.create({ roomId, username, type: 'image', imageUrl: String(imageUrl) });
      io.to(roomId).emit('message', msgDoc.toObject());
      cb?.({ ok: true });
    } catch (e) {
      cb?.({ ok: false });
    }
  });

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

// ===== Start server after Mongo connected =====
const PORT = process.env.PORT || 3000;
connectMongo().then(async () => {
  // pastikan room global ada
  await ensureRoomDoc('global', null);
  server.listen(PORT, () => console.log(`✅ CHK EJS+Mongo running on http://localhost:${PORT}`));
}).catch((err) => {
  console.error('Mongo connection error:', err);
  process.exit(1);
});
