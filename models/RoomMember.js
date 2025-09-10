// models/RoomMember.js
const mongoose = require('mongoose');

const RoomMemberSchema = new mongoose.Schema({
  roomId: { type: String, required: true, lowercase: true, trim: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['owner','mod','member'], default: 'member' },
  lastSeenMessageId: { type: String, default: '' },
  lastActiveAt: { type: Date, default: Date.now }
}, { timestamps: true });

RoomMemberSchema.index({ roomId: 1, userId: 1 }, { unique: true });
RoomMemberSchema.index({ roomId: 1, role: 1 });
RoomMemberSchema.index({ lastActiveAt: -1 });

module.exports = mongoose.model('RoomMember', RoomMemberSchema);
