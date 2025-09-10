// models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: { type: String, trim: true, required: true, minlength: 2, maxlength: 80 },
  username: { type: String, required: true, lowercase: true, trim: true, minlength: 3, maxlength: 32, match: /^[a-z0-9_]+$/ },
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 120 },
  passwordHash: { type: String, required: true }
}, { timestamps: true });

UserSchema.index({ username: 1 }, { unique: true });
UserSchema.index({ email: 1 }, { unique: true });

module.exports = mongoose.model('User', UserSchema);
