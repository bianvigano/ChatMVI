// controllers/authController.js
const bcrypt = require('bcryptjs');
const { nanoid } = require('nanoid');
const User = require('../models/User');
const Session = require('../models/Session');

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);

function parseCookies(raw = '') {
  const out = {};
  String(raw || '')
    .split(';')
    .forEach((p) => {
      const i = p.indexOf('=');
      if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
    });
  return out;
}

function setSessionCookie(res, sid) {
  // cookie httpOnly + sameSite Lax
  res.cookie('sid', sid, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,       // set true kalau sudah pakai HTTPS
    maxAge: 1000 * 60 * 60 * 24 * 30 // 30 hari
  });
}

exports.getRegister = (req, res) => {
  res.render('auth/register', { title: 'Daftar', values: {}, errors: {} });
};

exports.postRegister = async (req, res) => {
  const { name, username, email, password, password2 } = req.body || {};
  const values = { name, username, email };
  const errors = {};

  // Validasi dasar
  if (!name || name.trim().length < 2) errors.name = 'Nama terlalu pendek.';
  if (!username || !/^[a-z0-9_]{3,32}$/.test(username)) errors.username = 'Username 3-32, huruf kecil/angka/underscore.';
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.email = 'Email tidak valid.';
  if (!password || password.length < 6) errors.password = 'Minimal 6 karakter.';
  if (password !== password2) errors.password2 = 'Konfirmasi password tidak sama.';

  // Unik
  if (!errors.username) {
    const existsU = await User.exists({ username: username.toLowerCase() });
    if (existsU) errors.username = 'Username sudah dipakai.';
  }
  if (!errors.email) {
    const existsE = await User.exists({ email: email.toLowerCase() });
    if (existsE) errors.email = 'Email sudah terdaftar.';
  }

  if (Object.keys(errors).length) {
    return res.status(400).render('auth/register', { title: 'Daftar', values, errors });
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await User.create({
    name: name.trim(),
    username: username.toLowerCase().trim(),
    email: email.toLowerCase().trim(),
    passwordHash
  });

  return res.redirect('/login?registered=1');
};

exports.getLogin = (req, res) => {
  res.render('auth/login', { title: 'Masuk', values: {}, errors: {}, registered: !!req.query.registered });
};

exports.postLogin = async (req, res) => {
  const { login, password } = req.body || {}; // login = username ATAU email
  const values = { login };
  const errors = {};

  if (!login) errors.login = 'Isi username atau email.';
  if (!password) errors.password = 'Isi password.';

  if (Object.keys(errors).length) {
    return res.status(400).render('auth/login', { title: 'Masuk', values, errors });
  }

  const q = login.includes('@')
    ? { email: login.toLowerCase() }
    : { username: login.toLowerCase() };

  const user = await User.findOne(q);
  if (!user) {
    return res.status(400).render('auth/login', { title: 'Masuk', values, errors: { login: 'Akun tidak ditemukan.' } });
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return res.status(400).render('auth/login', { title: 'Masuk', values, errors: { password: 'Password salah.' } });
  }

  const sid = nanoid(24);
  await Session.create({
    sid,
    userId: user._id,
    ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'] || ''
  });
  setSessionCookie(res, sid);
  return res.redirect('/');
};

exports.postLogout = async (req, res) => {
  try {
    // ambil sid dari cookie (pakai req.cookies kalau ada, atau fallback header)
    const sid =
      (req.cookies && req.cookies.sid) ||
      parseCookies(req.headers.cookie || '').sid ||
      null;

    if (sid) {
      // hapus sesi di DB (token == sid)
      await Session.deleteOne({ token: sid }).catch(() => {});
    }

    // bersihkan cookie login & room
    const cookieOpts = {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    };
    res.clearCookie('sid', cookieOpts);
    res.clearCookie('rid', cookieOpts);

    // opsional: kosongkan user di res.locals
    if (res.locals) res.locals.user = null;

    // arahkan balik ke halaman awal (atau /login kalau kamu mau)
    return res.redirect(303, '/');
  } catch (e) {
    // fallback: tetap bersihkan cookie & redirect
    res.clearCookie('sid', { path: '/' });
    res.clearCookie('rid', { path: '/' });
    return res.redirect(303, '/');
  }
};
