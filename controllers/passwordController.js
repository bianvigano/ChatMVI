// controllers/passwordController.js
const bcrypt = require('bcryptjs');
const { nanoid } = require('nanoid');
const User = require('../models/User');
const PasswordResetToken = require('../models/PasswordResetToken');

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);
const RESET_TOKEN_TTL_MIN = 30;

exports.getForgot = (req, res) => {
  res.render('auth/forgot', { title: 'Lupa Password', values: {}, errors: {}, devLink: null });
};

exports.postForgot = async (req, res) => {
  const { login } = req.body || {}; // username atau email
  const values = { login };
  const errors = {};

  if (!login) errors.login = 'Isi username atau email.';
  if (Object.keys(errors).length) {
    return res.status(400).render('auth/forgot', { title: 'Lupa Password', values, errors, devLink: null });
  }

  const q = login.includes('@') ? { email: login.toLowerCase() } : { username: login.toLowerCase() };
  const user = await User.findOne(q);
  if (!user) {
    // Jangan bocorkan info — tampilkan sukses generik
    return res.render('auth/forgot', { title: 'Lupa Password', values: {}, errors: {}, devLink: null, ok: true });
  }

  const token = nanoid(40);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MIN * 60 * 1000);
  await PasswordResetToken.create({
    token,
    userId: user._id,
    expiresAt,
    ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'] || ''
  });

  // TODO: kirim email berisi link reset ke user.email
  // DEV mode: tampilkan link supaya gampang
  const link = `${req.protocol}://${req.get('host')}/reset/${token}`;

  if (process.env.NODE_ENV !== 'production') {
    console.log('[DEV] Reset link:', link);
    return res.render('auth/forgot', { title: 'Lupa Password', values: {}, errors: {}, devLink: link, ok: true });
  }

  return res.render('auth/forgot', { title: 'Lupa Password', values: {}, errors: {}, devLink: null, ok: true });
};

exports.getReset = async (req, res) => {
  const { token } = req.params;
  const rec = await PasswordResetToken.findOne({ token });
  if (!rec || rec.usedAt || rec.expiresAt < new Date()) {
    return res.status(400).render('auth/reset', { title: 'Reset Password', token: null, errors: { token: 'Token tidak valid / kedaluwarsa.' } });
  }
  return res.render('auth/reset', { title: 'Reset Password', token, errors: {} });
};

exports.postReset = async (req, res) => {
  const { token } = req.params;
  const { password, password2 } = req.body || {};
  const errors = {};

  const rec = await PasswordResetToken.findOne({ token });
  if (!rec || rec.usedAt || rec.expiresAt < new Date()) {
    return res.status(400).render('auth/reset', { title: 'Reset Password', token: null, errors: { token: 'Token tidak valid / kedaluwarsa.' } });
  }

  if (!password || password.length < 6) errors.password = 'Minimal 6 karakter.';
  if (password !== password2) errors.password2 = 'Konfirmasi tidak sama.';
  if (Object.keys(errors).length) {
    return res.status(400).render('auth/reset', { title: 'Reset Password', token, errors });
  }

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await User.updateOne({ _id: rec.userId }, { $set: { passwordHash: hash } });
  await PasswordResetToken.updateOne({ _id: rec._id }, { $set: { usedAt: new Date() } });

  return res.redirect('/login?reset=1');
};
