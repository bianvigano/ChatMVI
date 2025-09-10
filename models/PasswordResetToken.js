// models/PasswordResetToken.js
const mongoose = require('mongoose');

const PasswordResetTokenSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true }, // nanoid
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
  ip: String,
  userAgent: String
}, { timestamps: true });

PasswordResetTokenSchema.index({ userId: 1, createdAt: -1 });
PasswordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // auto TTL setelah expired

module.exports = mongoose.model('PasswordResetToken', PasswordResetTokenSchema);
