// ============================================================
// Unlocks Routes — Track which level-up modals the user has seen
// Mounted at /api/unlocks
// ============================================================

const express        = require('express');
const supabase       = require('../lib/supabase');
const { requireAuth} = require('../middleware/auth');
const router         = express.Router();

// ── GET /api/unlocks ─────────────────────────────────────────
// Returns { beginner: bool, intermediate: bool, advanced: bool }
router.get('/', requireAuth, async (req, res) => {
  const db = supabase;
  if (!db) return res.json({ beginner: false, intermediate: false, advanced: false });

  try {
    const { data, error } = await db
      .from('users')
      .select('unlocks_shown')
      .eq('id', req.user.id)
      .maybeSingle();

    if (error) throw error;

    const shown = data?.unlocks_shown || [];
    res.json({
      beginner:     shown.includes('beginner'),
      intermediate: shown.includes('intermediate'),
      advanced:     shown.includes('advanced')
    });
  } catch (err) {
    console.error('Error fetching unlocks:', err);
    res.status(500).json({ error: 'Failed to fetch unlocks' });
  }
});

// ── PUT /api/unlocks ─────────────────────────────────────────
// Body: { level: "beginner" | "intermediate" | "advanced" }
// Appends level to unlocks_shown array (idempotent via array_append guard)
router.put('/', requireAuth, async (req, res) => {
  const { level } = req.body;

  if (!['beginner', 'intermediate', 'advanced'].includes(level)) {
    return res.status(400).json({ error: 'level must be beginner, intermediate, or advanced' });
  }

  const db = supabase;
  if (!db) return res.json({ success: true });

  try {
    // Fetch current array, append only if not already present
    const { data, error: fetchErr } = await db
      .from('users')
      .select('unlocks_shown')
      .eq('id', req.user.id)
      .maybeSingle();

    if (fetchErr) throw fetchErr;

    const current = data?.unlocks_shown || [];
    if (!current.includes(level)) {
      const { error: updateErr } = await db
        .from('users')
        .update({ unlocks_shown: [...current, level] })
        .eq('id', req.user.id);

      if (updateErr) throw updateErr;
    }

    res.json({ success: true, level });
  } catch (err) {
    console.error('Error saving unlock:', err);
    res.status(500).json({ error: 'Failed to save unlock' });
  }
});

module.exports = router;
