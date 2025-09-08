// models/Message.js
const mongoose = require('mongoose');

const ParentSchema = new mongoose.Schema(
  {
    _id: String,   // id pesan induk (stringified ObjectId)
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
  {
    text: String,
    votes: [String], // daftar username
  },
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

    // text message
    text: String,
    editedAt: Date,

    // image message
    imageUrl: String,

    // reply
    parent: ParentSchema,

    // link preview
    linkPreview: LinkPreviewSchema,

    // poll
    poll: PollSchema,
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: false },
  }
);

// untuk query timeline cepat
MessageSchema.index({ roomId: 1, createdAt: -1 });

module.exports = mongoose.model('Message', MessageSchema);
