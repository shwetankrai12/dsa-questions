// ============================================================
// DSA Sheet by Shwetank — Express Server
// ============================================================

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express  = require('express');
const cors     = require('cors');
const session  = require('express-session');
const passport = require('passport');

// Import routes
const authRoutes      = require('./routes/auth');
const questionsRoutes = require('./routes/questions');
const progressRoutes  = require('./routes/progress');
const usersRoutes     = require('./routes/users');

// Configure passport strategies (Google OAuth)
require('./config/passport');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── CORS ─────────────────────────────────────────────────────
// Allow the Netlify frontend (and localhost in dev) to call the API.
// Authorization header must be explicitly allowed for JWT.
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3001',
  'http://localhost:3000'
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, Postman, same-origin)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false   // No cookies — we use JWT in Authorization header
}));

app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Session ───────────────────────────────────────────────────
// Used ONLY to store the OAuth state parameter (CSRF protection).
// User identity is handled via JWT, not session cookies.
app.use(session({
  secret:            process.env.SESSION_SECRET || 'dev-secret',
  resave:            false,
  saveUninitialized: false,
  cookie: {
    secure:   process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge:   10 * 60 * 1000   // 10 minutes — just long enough for OAuth round-trip
  }
}));

app.use(passport.initialize());
// Note: passport.session() intentionally omitted — no session-based user auth

// ── API Routes ────────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/questions', questionsRoutes);
app.use('/api/progress',  progressRoutes);
app.use('/api',           usersRoutes);    // /api/level  +  /api/streak

// ── Health Check ──────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Serve Frontend (local dev + Render) ───────────────────────
const FRONTEND_DIR = path.join(__dirname, '../frontend');

app.use(express.static(FRONTEND_DIR));

app.get('/dashboard',    (_req, res) => res.sendFile(path.join(FRONTEND_DIR, 'dashboard.html')));
app.get('/section',      (_req, res) => res.sendFile(path.join(FRONTEND_DIR, 'section.html')));
app.get('/level-select', (_req, res) => res.redirect('/index.html?auth=success'));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 DSA Sheet API running on port ${PORT}`);
  console.log(`   Environment : ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3001'}`);
});

module.exports = app;
