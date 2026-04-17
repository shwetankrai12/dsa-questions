// ============================================================
// User Routes — Level & Streak
// Mounted at /api → paths are /api/level and /api/streak
// ============================================================

const express              = require('express');
const jwt                  = require('jsonwebtoken');
const { saveLevel, getStreak, getStreakEntries, upsertStreakEntry } = require('../config/supabase');
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

// ── GET /api/streak/entries ──────────────────────────────────
// Returns { "YYYY-MM-DD": { done: bool }, ... } for the authenticated user.
router.get('/streak/entries', requireAuth, async (req, res) => {
  try {
    const entries = await getStreakEntries(req.user.id);
    res.json(entries);
  } catch (err) {
    console.error('Error fetching streak entries:', err);
    res.status(500).json({ error: 'Failed to fetch streak entries' });
  }
});

// ── POST /api/streak/entries ─────────────────────────────────
// Body: { date: "YYYY-MM-DD", done: true|false }
router.post('/streak/entries', requireAuth, async (req, res) => {
  const { date, done } = req.body;

  // Validate date format YYYY-MM-DD
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  }
  if (typeof done !== 'boolean') {
    return res.status(400).json({ error: 'done must be a boolean' });
  }

  try {
    await upsertStreakEntry(req.user.id, date, done);
    res.json({ success: true, date, done });
  } catch (err) {
    console.error('Error saving streak entry:', err);
    res.status(500).json({ error: 'Failed to save streak entry' });
  }
});

module.exports = router;
