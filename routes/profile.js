// routes/profile.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/profileController');

router.get('/profile', requireAuth, ctrl.getProfile);
router.post('/profile', requireAuth, express.urlencoded({ extended: false }), ctrl.postProfile);

module.exports = router;
