// ============================================================
// User Routes — Level & Streak
// Mounted at /api → paths are /api/level and /api/streak
// ============================================================

const express              = require('express');
const jwt                  = require('jsonwebtoken');
const { saveLevel, getStreak } = require('../config/supabase');
const { requireAuth }      = require('../middleware/auth');
const router               = express.Router();

// ── POST /api/level ──────────────────────────────────────────
// Saves chosen level, then re-issues the JWT with the updated level
// so the frontend's stored token stays in sync.
router.post('/level', requireAuth, async (req, res) => {
  const { level } = req.body;

  if (!['beginner', 'intermediate', 'advanced'].includes(level)) {
    return res.status(400).json({ error: 'Invalid level. Use: beginner, intermediate, advanced' });
  }

  try {
    await saveLevel(req.user.id, level);

    // Issue a fresh token with the new level embedded
    const token = jwt.sign(
      { id: req.user.id, email: req.user.email, name: req.user.name, avatar: req.user.avatar, level },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({ success: true, level, token });
  } catch (err) {
    console.error('Error saving level:', err);
    res.status(500).json({ error: 'Failed to save level' });
  }
});

// ── GET /api/streak ──────────────────────────────────────────
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
