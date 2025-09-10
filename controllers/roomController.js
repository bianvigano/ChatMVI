// controllers/roomController.js
const Room = require('../models/Room');
const RoomMember = require('../models/RoomMember');
const User = require('../models/User');

async function ensureOwner(req, res, next) {
  const { roomId } = req.params;
  const room = await Room.findOne({ roomId });
  if (!room || String(room.ownerId) !== String(req.user._id)) {
    return res.status(403).send('FORBIDDEN');
  }
  req.room = room;
  next();
}

exports.getMembers = async (req, res) => {
  const { roomId } = req.params;
  const room = await Room.findOne({ roomId }).lean();
  if (!room) return res.status(404).send('Room tidak ditemukan');
  const members = await RoomMember.find({ roomId }).populate('userId','username name email').lean();
  res.render('room/members', { title: `Anggota • ${roomId}`, room, members, me: req.user });
};

exports.postPromote = async (req, res) => {
  const { roomId } = req.params;
  const { userId } = req.body || {};
  if (!userId) return res.status(400).send('userId kosong');
  await RoomMember.updateOne({ roomId, userId }, { $set: { role: 'mod' } }, { upsert: true });
  return res.redirect(`/room/${roomId}/members`);
};

exports.postDemote = async (req, res) => {
  const { roomId } = req.params;
  const { userId } = req.body || {};
  if (!userId) return res.status(400).send('userId kosong');
  // jangan turunkan owner
  const room = await Room.findOne({ roomId });
  if (String(room.ownerId) === String(userId)) return res.status(400).send('Tidak bisa turunkan owner');
  await RoomMember.updateOne({ roomId, userId }, { $set: { role: 'member' } });
  return res.redirect=(`/room/${roomId}/members`);
};

exports.middleware = { ensureOwner };
