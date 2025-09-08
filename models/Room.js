// models/Room.js
const mongoose = require('mongoose');

const AnnouncementSchema = new mongoose.Schema({
  text: String,
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const ThemeSchema = new mongoose.Schema({
  mode: { type: String, enum: ['light', 'dark'], default: 'light' },
  accent: { type: String, default: '#7b1fa2' }
}, { _id: false });

const RoomSchema = new mongoose.Schema({
  roomId: { type: String, unique: true, index: true, required: true },

  // Auth
  password: { type: String, default: null, select: false }, // legacy (akan auto-migrate)
  passwordHash: { type: String, default: null },

  // Roles & moderation
  owner: { type: String, default: null },       // username pembuat room
  mods: { type: [String], default: [] },        // moderator
  bannedUsers: { type: [String], default: [] }, // daftar yang diblokir

  // Info
  topic: { type: String, default: '' },
  rules: { type: String, default: '' },
  slowModeSec: { type: Number, default: 0 },

  // Pins & announcements
  pinnedMessageIds: { type: [String], default: [] },
  announcements: { type: [AnnouncementSchema], default: [] },

  // Theme
  theme: { type: ThemeSchema, default: () => ({}) },
}, { timestamps: true });

module.exports = mongoose.model('Room', RoomSchema);
