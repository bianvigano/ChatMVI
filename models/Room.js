// models/Room.js
const mongoose = require('mongoose');

const RoomSchema = new mongoose.Schema(
  {
    roomId: { type: String, unique: true, index: true, required: true },

    // LEGACY (plaintext) - tidak di-select default, hanya buat backward compat migrasi
    password: { type: String, default: null, select: false },

    // BARU (hash)
    passwordHash: { type: String, default: null },

    topic: { type: String, default: '' },
    rules: { type: String, default: '' },
    slowModeSec: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Room', RoomSchema);
