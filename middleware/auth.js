// middleware/auth.js
const Session = require('../models/Session');
const User = require('../models/User');

// Parse cookie manual (tanpa cookie-parser)
function parseCookies(req) {
  const raw = req.headers.cookie || '';
  const out = {};
  raw.split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > -1) {
      const k = p.slice(0, i).trim();
      const v = decodeURIComponent(p.slice(i + 1).trim());
      out[k] = v;
    }
  });
  return out;
}

async function loadUser(req, res, next) {
  try {
    req.cookies = parseCookies(req);
    const sid = req.cookies.sid;
    if (!sid) {
      res.locals.user = null;
      return next();
    }
    const sess = await Session.findOne({ sid }).lean();
    if (!sess) {
      res.locals.user = null;
      return next();
    }
    const user = await User.findById(sess.userId).lean();
    if (!user) {
      res.locals.user = null;
      return next();
    }
    req.user = user;
    res.locals.user = { _id: user._id, name: user.name, username: user.username, email: user.email };
    // update last seen (non-blocking)
    Session.updateOne({ sid }, { $set: { lastSeenAt: new Date() } }).catch(()=>{});
    next();
  } catch (e) {
    next(e);
  }
}

function requireGuest(req, res, next) {
  if (req.user) return res.redirect('/');
  next();
}
function requireAuth(req, res, next) {
  if (!req.user) return res.redirect('/login');
  next();
}

module.exports = { loadUser, requireGuest, requireAuth };
