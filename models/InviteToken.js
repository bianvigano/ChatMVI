const mongoose = require('mongoose');

const InviteTokenSchema = new mongoose.Schema({
  roomId: { type: String, index: true, required: true },
  token: { type: String, unique: true, required: true }, // already creates the index
  singleUse: { type: Boolean, default: true },
  expiresAt: { type: Date, default: null },
  usedAt: { type: Date, default: null },
}, { timestamps: true });

// Remove this duplicate: InviteTokenSchema.index({ token: 1 });
InviteTokenSchema.index({ roomId: 1, expiresAt: 1 }); // keep if you query by both

module.exports = mongoose.model('InviteToken', InviteTokenSchema);
