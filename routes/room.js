// routes/room.js (gabungan)
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const mgmt = require('../controllers/roomController');
const http = require('../controllers/roomHttpController');

// --- HTTP join/create ---
router.post('/join/global', requireAuth, express.urlencoded({ extended: false }), http.postJoinGlobal);

// Versi GET untuk testing/manual click (optional, enak buat debug)
// router.get('/join/global', requireAuth, (req, res) => {
//   res.cookie('rid', 'global', {
//     httpOnly: true,
//     sameSite: 'lax',
//     secure: process.env.NODE_ENV === 'production',
//     maxAge: 1000 * 60 * 60 * 24 * 7,
//     path: '/'
//   });
//   return res.redirect(303, '/');
// });

router.post('/room/create', requireAuth, express.urlencoded({ extended: false }), http.postCreateRoom);
router.post('/room/join',   requireAuth, express.urlencoded({ extended: false }), http.postJoinPrivate);

// --- Manajemen anggota ---
router.get('/room/:roomId/members', requireAuth, mgmt.getMembers);
router.post('/room/:roomId/promote', requireAuth, express.urlencoded({ extended: false }), mgmt.middleware.ensureOwner, mgmt.postPromote);
router.post('/room/:roomId/demote',  requireAuth, express.urlencoded({ extended: false }), mgmt.middleware.ensureOwner, mgmt.postDemote);

module.exports = router;
