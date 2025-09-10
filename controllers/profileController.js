// controllers/profileController.js
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);

exports.getProfile = (req, res) => {
  res.render('auth/profile', {
    title: 'Profil',
    user: res.locals.user,
    values: { name: res.locals.user?.name || '' },
    errors: {},
    ok: false
  });
};

exports.postProfile = async (req, res) => {
  const { name, currentPassword, newPassword, newPassword2 } = req.body || {};
  const values = { name };
  const errors = {};
  const user = await User.findById(req.user._id);

  if (!name || name.trim().length < 2) errors.name = 'Nama terlalu pendek.';

  // ganti password opsional
  if (currentPassword || newPassword || newPassword2) {
    if (!currentPassword) errors.currentPassword = 'Isi password saat ini.';
    if (!newPassword || newPassword.length < 6) errors.newPassword = 'Minimal 6 karakter.';
    if (newPassword !== newPassword2) errors.newPassword2 = 'Konfirmasi tidak sama.';
    if (currentPassword && !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      errors.currentPassword = 'Password saat ini salah.';
    }
  }

  if (Object.keys(errors).length) {
    return res.status(400).render('auth/profile', { title: 'Profil', user: res.locals.user, values, errors, ok: false });
  }

  const update = { name: name.trim() };
  if (newPassword) {
    update.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  }
  await User.updateOne({ _id: user._id }, { $set: update });

  // refresh res.locals.user untuk header
  res.locals.user.name = update.name;
  return res.render('auth/profile', { title: 'Profil', user: res.locals.user, values: { name: update.name }, errors: {}, ok: true });
};
