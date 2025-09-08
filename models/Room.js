// models/Room.js
const mongoose = require('mongoose');

const RoomSchema = new mongoose.Schema(
  {
    roomId: { type: String, unique: true, index: true, required: true },
    password: { type: String, default: null }, // (Demo) plaintext. Produksi sebaiknya di-hash.
    topic: { type: String, default: '' },
    rules: { type: String, default: '' },
    slowModeSec: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Room', RoomSchema);
