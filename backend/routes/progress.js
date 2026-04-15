// ============================================================
// Progress Routes — User Question Progress
// ============================================================

const express = require('express');
const {
  getProgress,
  getSectionProgress,
  upsertProgress
} = require('../config/supabase');
const router = express.Router();

// ── Auth Middleware ──────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

// ── GET /api/progress ────────────────────────────────────────
// Returns all progress as { section: { questionId: status } }
router.get('/', requireAuth, async (req, res) => {
  try {
    const progress = await getProgress(req.user.id);
    res.json(progress);
  } catch (err) {
    console.error('Error fetching progress:', err);
    res.status(500).json({ error: 'Failed to fetch progress' });
  }
});

// ── GET /api/progress/:section ───────────────────────────────
// Returns progress for one section as { questionId: status }
router.get('/:section', requireAuth, async (req, res) => {
  try {
    const progress = await getSectionProgress(req.user.id, req.params.section);
    res.json(progress);
  } catch (err) {
    console.error('Error fetching section progress:', err);
    res.status(500).json({ error: 'Failed to fetch section progress' });
  }
});

// ── POST /api/progress ───────────────────────────────────────
// Body: { section, questionId, status }
// Primary endpoint used by the frontend on every status button click.
router.post('/', requireAuth, async (req, res) => {
  const { section, questionId, status } = req.body;

  if (!section || !questionId) {
    return res.status(400).json({ error: 'section and questionId are required' });
  }
  if (!['todo', 'progress', 'done'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Use: todo, progress, done' });
  }

  try {
    await upsertProgress(req.user.id, section, questionId, status);
    res.json({ success: true, section, questionId, status });
  } catch (err) {
    console.error('Error saving progress:', err);
    res.status(500).json({ error: 'Failed to save progress' });
  }
});

// ── PUT /api/progress/:section/:questionId ───────────────────
// RESTful alternative — same result as POST /
router.put('/:section/:questionId', requireAuth, async (req, res) => {
  const { section, questionId } = req.params;
  const { status } = req.body;

  if (!['todo', 'progress', 'done'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Use: todo, progress, done' });
  }

  try {
    await upsertProgress(req.user.id, section, questionId, status);
    res.json({ success: true, section, questionId, status });
  } catch (err) {
    console.error('Error updating progress:', err);
    res.status(500).json({ error: 'Failed to update progress' });
  }
});

// ── POST /api/progress/bulk ──────────────────────────────────
// Body: { updates: [{ section, questionId, status }] }
// NOTE: declared after POST / so Express matches /bulk before the root handler.
router.post('/bulk', requireAuth, async (req, res) => {
  const { updates } = req.body;

  if (!Array.isArray(updates)) {
    return res.status(400).json({ error: 'updates must be an array' });
  }

  try {
    await Promise.all(
      updates.map(u => upsertProgress(req.user.id, u.section, u.questionId, u.status))
    );
    res.json({ success: true, updated: updates.length });
  } catch (err) {
    console.error('Error bulk updating progress:', err);
    res.status(500).json({ error: 'Failed to bulk update progress' });
  }
});

module.exports = router;
