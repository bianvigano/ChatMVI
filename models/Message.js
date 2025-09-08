// models/Message.js
const mongoose = require('mongoose');

const ParentSchema = new mongoose.Schema({
  _id: String, id: String, username: String, text: String, createdAt: Date,
}, { _id: false });

const LinkPreviewSchema = new mongoose.Schema({
  url: String, title: String, image: String, description: String, siteName: String,
}, { _id: false });

const PollOptionSchema = new mongoose.Schema({
  text: String, votes: [String],
}, { _id: false });

const PollSchema = new mongoose.Schema({
  question: String, options: [PollOptionSchema], isClosed: { type: Boolean, default: false },
}, { _id: false });

const FileSchema = new mongoose.Schema({
  url: String, name: String, mime: String, size: Number
}, { _id: false });

const EditHistorySchema = new mongoose.Schema({
  text: String,
  editedAt: { type: Date, default: Date.now }
}, { _id: false });

const MessageSchema = new mongoose.Schema({
  roomId: { type: String, required: true, index: true },
  username: { type: String, required: true },

  type: { type: String, enum: ['text', 'image', 'poll', 'file'], default: 'text' },
  text: String,
  editedAt: Date,
  editHistory: { type: [EditHistorySchema], default: [] },

  imageUrl: String,
  file: FileSchema,

  parent: ParentSchema,
  linkPreview: LinkPreviewSchema,

  poll: PollSchema,

  // Reactions & read receipts
  reactions: { type: Map, of: [String], default: undefined }, // { '👍': ['alice','bob'] }
  seenBy: { type: [String], default: [] },

  // Moderation
  flagged: { type: Boolean, default: false },
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } });

// Index untuk timeline + cursor
MessageSchema.index({ roomId: 1, createdAt: -1, _id: -1 });
// Tambahan filter
MessageSchema.index({ roomId: 1, type: 1, createdAt: -1 });
MessageSchema.index({ roomId: 1, username: 1, createdAt: -1 });
// Pencarian text
MessageSchema.index({ text: 'text' });

module.exports = mongoose.model('Message', MessageSchema);
