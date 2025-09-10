// models/Session.js
const mongoose = require('mongoose');

const SessionSchema = new mongoose.Schema({
  sid: { type: String, required: true, unique: true }, // session id (cookie)
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  ip: String,
  userAgent: String,
  lastSeenAt: { type: Date, default: Date.now }
}, { timestamps: true });

SessionSchema.index({ userId: 1 });
SessionSchema.index({ updatedAt: -1 });

module.exports = mongoose.model('Session', SessionSchema);
