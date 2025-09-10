// routes/password.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/passwordController');
const { requireGuest } = require('../middleware/auth');

router.get('/forgot', requireGuest, ctrl.getForgot);
router.post('/forgot', requireGuest, express.urlencoded({ extended: false }), ctrl.postForgot);

router.get('/reset/:token', requireGuest, ctrl.getReset);
router.post('/reset/:token', requireGuest, express.urlencoded({ extended: false }), ctrl.postReset);

module.exports = router;
