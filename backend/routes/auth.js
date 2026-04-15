// ============================================================
// Auth Routes — Google OAuth
// ============================================================

const express  = require('express');
const passport = require('passport');
const router   = express.Router();

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3001';

// ── Initiate Google Login ────────────────────────────────────
router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email']
}));

// ── Google OAuth Callback ────────────────────────────────────
router.get('/google/callback', (req, res, next) => {
  passport.authenticate('google', (err, user, info) => {
    if (err) {
      console.error('=== OAUTH ERROR ===');
      console.error('code   :', err.code);
      console.error('message:', err.message);
      console.error('raw    :', JSON.stringify(err.oauthError || err));
      return res.redirect(`${FRONTEND_URL}/index.html?auth=failed&reason=${encodeURIComponent(err.code + ': ' + err.message)}`);
    }
    if (!user) {
      console.error('OAuth no user returned:', info);
      return res.redirect(`${FRONTEND_URL}/index.html?auth=failed`);
    }
    req.logIn(user, loginErr => {
      if (loginErr) return next(loginErr);
      if (user.isNewUser || !user.level) {
        return res.redirect(`${FRONTEND_URL}/index.html?auth=success`);
      }
      res.redirect(`${FRONTEND_URL}/dashboard.html`);
    });
  })(req, res, next);
});

// ── Get Current User ─────────────────────────────────────────
router.get('/me', (req, res) => {
  if (req.isAuthenticated()) {
    return res.json({
      authenticated: true,
      user: {
        id:     req.user.id,
        name:   req.user.name,
        email:  req.user.email,
        avatar: req.user.avatar,
        level:  req.user.level
      }
    });
  }
  res.json({ authenticated: false });
});

// ── Logout ───────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  req.logout(err => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    req.session.destroy(() => res.json({ success: true }));
  });
});

module.exports = router;
