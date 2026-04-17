// ============================================================
// Auth Routes — Google OAuth + JWT issuance
// ============================================================

const express      = require('express');
const passport     = require('passport');
const jwt          = require('jsonwebtoken');
const { requireAuth } = require('../middleware/auth');
const router       = express.Router();

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3001';

/** Sign a 30-day JWT containing all user fields the frontend needs. */
function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, avatar: user.avatar, level: user.level || null },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

// ── Initiate Google Login ────────────────────────────────────
router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email']
}));

// ── Google OAuth Callback ────────────────────────────────────
// Issues a JWT and redirects to the frontend with it in the URL.
// The frontend reads the token, stores it in localStorage, then cleans the URL.
router.get('/google/callback', (req, res, next) => {
  passport.authenticate('google', (err, user) => {
    if (err) {
      console.error('OAuth error:', err);
      return res.redirect(`${FRONTEND_URL}/index.html?auth=failed`);
    }
    if (!user) {
      return res.redirect(`${FRONTEND_URL}/index.html?auth=failed`);
    }

    const token = signToken(user);

    if (user.isNewUser || !user.level) {
      // New user → level selection page
      return res.redirect(`${FRONTEND_URL}/index.html?auth=success&token=${token}`);
    }
    // Returning user → dashboard
    res.redirect(`${FRONTEND_URL}/dashboard.html?token=${token}`);
  })(req, res, next);
});

// ── GET /api/auth/me ─────────────────────────────────────────
// Returns user from the JWT — no session needed.
router.get('/me', requireAuth, (req, res) => {
  res.json({
    authenticated: true,
    user: {
      id:     req.user.id,
      name:   req.user.name,
      email:  req.user.email,
      avatar: req.user.avatar,
      level:  req.user.level
    }
  });
});

// ── POST /api/auth/logout ────────────────────────────────────
// JWT is stateless — server has nothing to destroy.
// Client deletes the token from localStorage.
router.post('/logout', (req, res) => {
  res.json({ success: true });
});

module.exports = router;
