// controllers/roomHttpController.js
const bcrypt = require('bcryptjs');
const Room = require('../models/Room');
const RoomMember = require('../models/RoomMember');

function setRoomCookie(res, roomId) {
  res.cookie('rid', roomId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production', // set true kalau HTTPS/production
    maxAge: 1000 * 60 * 60 * 24 * 7,               // 7 hari
    path: '/'
  });
}

exports.postJoinGlobal = async (req, res) => {
  setRoomCookie(res, 'global');
  if (req.user?._id) {
    await RoomMember.updateOne(
      { roomId: 'global', userId: req.user._id },
      { $setOnInsert: { role: 'member' } },
      { upsert: true }
    );
  }
  return res.redirect(303, '/'); // 303 → GET /
};

exports.postCreateRoom = async (req, res) => {
  const { roomId, password } = req.body || {};
  if (!roomId || !password) return res.status(400).send('Lengkapi roomId & password');

  const rid = String(roomId).toLowerCase().trim();
  const exists = await Room.findOne({ roomId: rid });
  if (exists) return res.status(400).send('Room sudah ada');

  const rounds = Math.max(4, parseInt(process.env.BCRYPT_ROUNDS || '10', 10) || 10);
  const hash = await bcrypt.hash(String(password), rounds);

  await Room.create({
    roomId: rid,
    ownerId: req.user?._id || null,
    passwordHash: hash,
    topic: '',
    rules: ''
  });

  if (req.user?._id) {
    await RoomMember.updateOne(
      { roomId: rid, userId: req.user._id },
      { $set: { role: 'owner' } },
      { upsert: true }
    );
  }
  setRoomCookie(res, rid);
  return res.redirect(303, '/');
};

exports.postJoinPrivate = async (req, res) => {
  const { roomId, password, inviteToken } = req.body || {};
  if (!roomId) return res.status(400).send('Isi roomId');

  const rid = String(roomId).toLowerCase().trim();
  const room = await Room.findOne({ roomId: rid });
  if (!room) return res.status(404).send('Room tidak ditemukan');

  // Validasi: password atau (nanti) token
  if (room.passwordHash) {
    if (!password) return res.status(400).send('Password wajib');
    const ok = await bcrypt.compare(String(password), room.passwordHash);
    if (!ok) return res.status(400).send('Password salah');
  } else if (inviteToken) {
    // TODO: validasi token undangan (kalau dipakai)
  }

  if (req.user?._id) {
    await RoomMember.updateOne(
      { roomId: rid, userId: req.user._id },
      { $setOnInsert: { role: 'member' } },
      { upsert: true }
    );
  }
  setRoomCookie(res, rid);
  return res.redirect(303, '/');
};
