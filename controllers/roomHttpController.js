// controllers/roomHttpController.js
const bcrypt = require('bcryptjs');
const Room = require('../models/Room');
const RoomMember = require('../models/RoomMember');

// (Opsional) Audit; otomatis di-skip jika model tidak tersedia
let Audit = null;
try { Audit = require('../models/Audit'); } catch { /* optional */ }

// ===== Helpers =====
function setRoomCookie(res, roomId) {
  res.cookie('rid', roomId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production', // true di prod/HTTPS
    maxAge: 7 * 24 * 60 * 60 * 1000,               // 7 hari
    path: '/',
  });
}

function normalizeRoomId(raw) {
  return String(raw || '').toLowerCase().trim();
}

// Karakter yang aman untuk roomId: a-z 0-9 - _ .
const ROOM_RE = /^[a-z0-9-_.]{2,50}$/;

async function upsertMember(roomId, user, roleIfInsert = 'member') {
  if (!user?._id) return;
  await RoomMember.updateOne(
    { roomId, userId: user._id },
    { $setOnInsert: { role: roleIfInsert } },
    { upsert: true }
  );
}

async function audit(type, roomId, actor, meta) {
  if (!Audit) return;
  try { await Audit.create({ type, roomId, actor, meta }); } catch {}
}

// ===== Controllers =====

/**
 * POST /join/global
 * Set cookie rid = 'global' → redirect /
 */
exports.postJoinGlobal = async (req, res) => {
  try {
    setRoomCookie(res, 'global');
    await upsertMember('global', req.user, 'member');
    await audit('JOIN_GLOBAL', 'global', req.user?.username || req.user?._id || 'http');

    return res.redirect(303, '/chat'); // GET /
  } catch (e) {
    return res.redirect('/?err=JOIN_GLOBAL_ERR');
  }
};

/**
 * POST /room/create
 * Body: roomId, password
 * - roomId & password wajib (ubah kebijakan jika ingin room tanpa password)
 */
exports.postCreateRoom = async (req, res) => {
  try {
    const rid = normalizeRoomId(req.body?.roomId);
    const password = String(req.body?.password || '');

    if (!rid || !password) return res.redirect('/?err=ROOM_PASS_REQUIRED');
    if (!ROOM_RE.test(rid)) return res.redirect('/?err=ROOM_ID_INVALID');

    const exists = await Room.findOne({ roomId: rid }).lean();
    if (exists) return res.redirect('/?err=ROOM_EXISTS');

    const rounds = Math.max(4, parseInt(process.env.BCRYPT_ROUNDS || '10', 10) || 10);
    const passwordHash = await bcrypt.hash(password, rounds);

    const ownerId = req.user?._id || null;
    const ownerName = req.user?.username || req.user?.name || 'system';

    await Room.create({
      roomId: rid,
      passwordHash,
      ownerId,
      owner: ownerName,     // simpan juga nama (kalau schema kamu pakai)
      topic: '',
      rules: '',
      slowModeSec: 0,
      mods: [],
      bannedUsers: [],
      theme: { mode: 'light' },
      pinnedMessageIds: [],
      announcements: [],
    });

    await upsertMember(rid, req.user, 'owner');
    await audit('CREATE_ROOM', rid, ownerName);

    setRoomCookie(res, rid);
    return res.redirect(303, '/');
  } catch (e) {
    return res.redirect('/?err=CREATE_ERR');
  }
};

/**
 * POST /room/join
 * Body: roomId, password, (opsional) inviteToken
 * - Validasi room & password (atau token) → set cookie rid
 */
exports.postJoinPrivate = async (req, res) => {
  try {
    const inviteToken = String(req.body?.inviteToken || '');
    const rid = normalizeRoomId(req.body?.roomId);
    if (!rid) return res.redirect('/?err=ROOM_REQUIRED');
    if (!ROOM_RE.test(rid)) return res.redirect('/?err=ROOM_ID_INVALID');

    // Ambil password/passwordHash meski select:false di schema
    const room = await Room.findOne({ roomId: rid })
      .select('+password +passwordHash')
      .lean();
    if (!room) return res.redirect('/?err=ROOM_NOT_FOUND');

    // Validasi password atau invite token
    if (inviteToken) {
      // TODO: verifikasi token undangan (InviteToken) bila kamu aktifkan fitur ini
      // Jika valid: lanjut; jika tidak: return res.redirect('/?err=INVITE_INVALID');
    } else if (room.passwordHash || room.password) {
      const pass = String(req.body?.password || '');
      let ok = false;

      if (room.passwordHash) {
        ok = await bcrypt.compare(pass, room.passwordHash);
      } else {
        ok = pass === room.password;
        // Migrasi transparan: simpan hash lalu unset plaintext
        if (ok) {
          try {
            const rounds = Math.max(4, parseInt(process.env.BCRYPT_ROUNDS || '10', 10) || 10);
            const newHash = await bcrypt.hash(pass, rounds);
            await Room.updateOne({ roomId: rid }, { $set: { passwordHash: newHash }, $unset: { password: 1 } });
          } catch {}
        }
      }

      if (!ok) return res.redirect('/?err=BAD_PASSWORD');
    }

    await upsertMember(rid, req.user, 'member');
    await audit('JOIN_ROOM', rid, req.user?.username || req.user?._id || 'http');

    setRoomCookie(res, rid);
    return res.redirect(303, '/');
  } catch (e) {
    return res.redirect('/?err=JOIN_ERR');
  }
};
