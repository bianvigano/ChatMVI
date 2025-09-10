// routes/room.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const mgmt = require('../controllers/roomController');
const http = require('../controllers/roomHttpController');

// --- HTTP join/create (sudah ada) ---
router.post('/join/global', requireAuth, express.urlencoded({ extended: false }), http.postJoinGlobal);
router.post('/room/create', requireAuth, express.urlencoded({ extended: false }), http.postCreateRoom);
router.post('/room/join',   requireAuth, express.urlencoded({ extended: false }), http.postJoinPrivate);

// === [BARU] GET: set cookie rid via URL lalu redirect ke / ===
router.get('/r/:rid', requireAuth, (req, res) => {
  const rid = String(req.params.rid || '').toLowerCase().trim();
  if (!/^[a-z0-9-_.]{2,50}$/.test(rid)) {
    return res.redirect('/?err=ROOM_ID_INVALID');
  }
  res.cookie('rid', rid, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/'
  });
  return res.redirect(303, '/chat');
});

// --- Manajemen anggota (sudah ada) ---
router.get('/room/:roomId/members', requireAuth, mgmt.getMembers);
router.post('/room/:roomId/promote', requireAuth, express.urlencoded({ extended: false }), mgmt.middleware.ensureOwner, mgmt.postPromote);
router.post('/room/:roomId/demote',  requireAuth, express.urlencoded({ extended: false }), mgmt.middleware.ensureOwner, mgmt.postDemote);

module.exports = router;
