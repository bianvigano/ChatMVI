// models/Message.js
const mongoose = require('mongoose');

const ParentSchema = new mongoose.Schema(
  {
    _id: String,
    id: String,
    username: String,
    text: String,
    createdAt: Date,
  },
  { _id: false }
);

const LinkPreviewSchema = new mongoose.Schema(
  {
    url: String,
    title: String,
    image: String,
    description: String,
    siteName: String,
  },
  { _id: false }
);

const PollOptionSchema = new mongoose.Schema(
  { text: String, votes: [String] },
  { _id: false }
);

const PollSchema = new mongoose.Schema(
  {
    question: String,
    options: [PollOptionSchema],
    isClosed: { type: Boolean, default: false },
  },
  { _id: false }
);

const MessageSchema = new mongoose.Schema(
  {
    roomId: { type: String, required: true, index: true },
    username: { type: String, required: true },
    type: { type: String, enum: ['text', 'image', 'poll'], default: 'text' },

    text: String,
    editedAt: Date,

    imageUrl: String,

    parent: ParentSchema,
    linkPreview: LinkPreviewSchema,

    poll: PollSchema,
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);

// INDEXES untuk performa timeline & filter
MessageSchema.index({ roomId: 1, createdAt: -1, _id: -1 }); // utama (cursor)
MessageSchema.index({ roomId: 1, type: 1, createdAt: -1 }); // jika sering filter type
MessageSchema.index({ roomId: 1, username: 1, createdAt: -1 }); // riwayat per-user

module.exports = mongoose.model('Message', MessageSchema);
