// ============================================================
// Questions Routes
// ============================================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

// Load questions data
let questionsData = null;

function loadQuestions() {
  if (questionsData) return questionsData;
  
  const filePath = path.join(__dirname, '../data/questions.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  questionsData = JSON.parse(raw);
  return questionsData;
}

// ── Get All Questions ──
router.get('/', (req, res) => {
  try {
    const data = loadQuestions();
    res.json(data);
  } catch (err) {
    console.error('Error loading questions:', err);
    res.status(500).json({ error: 'Failed to load questions' });
  }
});

// ── Get Questions by Section ──
router.get('/:section', (req, res) => {
  try {
    const data = loadQuestions();
    const section = req.params.section;
    
    if (!data[section]) {
      return res.status(404).json({ error: `Section '${section}' not found` });
    }

    res.json(data[section]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load questions' });
  }
});

// ── Get Questions by Section and Level ──
router.get('/:section/:level', (req, res) => {
  try {
    const data = loadQuestions();
    const { section, level } = req.params;
    
    if (!data[section]) {
      return res.status(404).json({ error: `Section '${section}' not found` });
    }

    if (!data[section][level]) {
      return res.status(404).json({ error: `Level '${level}' not found in section '${section}'` });
    }

    res.json(data[section][level]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load questions' });
  }
});

module.exports = router;
