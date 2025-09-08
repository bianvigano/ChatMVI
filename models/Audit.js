// models/Audit.js
const mongoose = require('mongoose');

const AuditSchema = new mongoose.Schema({
  type: { type: String, required: true }, // 'CREATE_ROOM','BAN','UNBAN','KICK','PIN','UNPIN','DELETE','EDIT','MOD','UNMOD','EXPORT','INVITE'
  roomId: { type: String },
  actor: { type: String },   // yang melakukan
  target: { type: String },  // yang terkena (optional)
  meta: { type: Object, default: {} },
}, { timestamps: true });

AuditSchema.index({ roomId: 1, createdAt: -1 });
module.exports = mongoose.model('Audit', AuditSchema);
