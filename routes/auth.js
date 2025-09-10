// routes/auth.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/authController');
const { requireGuest, requireAuth } = require('../middleware/auth');

router.get('/register', requireGuest, ctrl.getRegister);
router.post('/register', requireGuest, express.urlencoded({ extended: false }), ctrl.postRegister);

router.get('/login', requireGuest, ctrl.getLogin);
router.post('/login', requireGuest, express.urlencoded({ extended: false }), ctrl.postLogin);

router.post('/logout', requireAuth, ctrl.postLogout);

module.exports = router;
