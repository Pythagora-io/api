const express = require('express');
const router = express.Router();
const passport = require("passport");

// Google and GitHub authentication routes
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback', passport.authenticate('google', { successRedirect: '/', failureRedirect: '/login' }));
router.get('/github', passport.authenticate('github', { scope: ['user:email'] }));
router.get('/github/callback', passport.authenticate('github', { successRedirect: '/', failureRedirect: '/login' }));

module.exports = router;
