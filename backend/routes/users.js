// ============================================================
// User Routes — Level & Streak
// Mounted at /api in server.js, so paths are /api/level and /api/streak
// ============================================================

const express             = require('express');
const { saveLevel, getStreak } = require('../config/supabase');
const router              = express.Router();

// ── Auth Middleware ──────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

// ── POST /api/level ──────────────────────────────────────────
// Persist the level the user selected and store it in the session
// so subsequent /api/auth/me calls return the updated level.
router.post('/level', requireAuth, async (req, res) => {
  const { level } = req.body;

  if (!['beginner', 'intermediate', 'advanced'].includes(level)) {
    return res.status(400).json({ error: 'Invalid level. Use: beginner, intermediate, advanced' });
  }

  try {
    await saveLevel(req.user.id, level);

    // Keep session in sync
    req.user.level     = level;
    req.user.isNewUser = false;

    res.json({ success: true, level });
  } catch (err) {
    console.error('Error saving level:', err);
    res.status(500).json({ error: 'Failed to save level' });
  }
});

// ── GET /api/streak ──────────────────────────────────────────
// Returns { current_streak, last_practice_date }
router.get('/streak', requireAuth, async (req, res) => {
  try {
    const streak = await getStreak(req.user.id);
    res.json(streak);
  } catch (err) {
    console.error('Error fetching streak:', err);
    res.status(500).json({ error: 'Failed to fetch streak' });
  }
});

module.exports = router;
