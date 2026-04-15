// ============================================================
// DSA Sheet by Shwetank — Express Server
// ============================================================

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') }); // always loads backend/.env
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');

// Import routes
const authRoutes      = require('./routes/auth');
const questionsRoutes = require('./routes/questions');
const progressRoutes  = require('./routes/progress');
const usersRoutes     = require('./routes/users');

// Import passport config
require('./config/passport');

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ──
app.set('trust proxy', 1);
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3001',
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// ── API Routes ──
app.use('/api/auth', authRoutes);
app.use('/api/questions', questionsRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api', usersRoutes);          // /api/level  +  /api/streak

// ── Health Check ──
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Debug (remove after OAuth is working) ──
app.get('/api/debug', (req, res) => {
  res.json({
    GOOGLE_CLIENT_ID:     process.env.GOOGLE_CLIENT_ID     ? process.env.GOOGLE_CLIENT_ID.slice(0, 20) + '...' : 'MISSING',
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? 'SET (' + process.env.GOOGLE_CLIENT_SECRET.length + ' chars)' : 'MISSING',
    BACKEND_URL:          process.env.BACKEND_URL  || 'MISSING',
    FRONTEND_URL:         process.env.FRONTEND_URL || 'MISSING',
    SESSION_SECRET:       process.env.SESSION_SECRET ? 'SET' : 'MISSING',
    callbackURL:         `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/auth/google/callback`
  });
});

// ── Serve Frontend (all environments) ──
const FRONTEND_DIR = path.join(__dirname, '../frontend');

app.use(express.static(FRONTEND_DIR));

// Named HTML routes so /dashboard, /section, /level-select work without .html
app.get('/dashboard',    (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'dashboard.html')));
app.get('/section',      (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'section.html')));
app.get('/level-select', (req, res) => res.redirect('/index.html?auth=success'));

// Fallback — any unknown route serves index.html (keeps SPA navigation working)
app.get('*', (req, res) => {
  // Don't swallow unmatched /api/* calls — let them 404 properly
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// ── Start Server ──
app.listen(PORT, () => {
  console.log(`🚀 DSA Sheet API running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
