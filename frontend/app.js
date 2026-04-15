/* ============================================================
   DSA Sheet by Shwetank — Frontend Application Logic
   ============================================================ */

// ═══ Configuration ═══════════════════════════════════════════
// Local dev  → absolute backend URL (avoids port mismatch on :3001)
// Production → relative /api  (Netlify proxy rewrites to Render)
const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:3001/api'
  : '/api';

const SECTIONS = {
  dsa:           { name: 'DSA',           icon: '📊', color: '#a3e635' },
  interview:     { name: 'Interview Prep', icon: '💼', color: '#f59e0b' },
  system_design: { name: 'System Design', icon: '🏗️', color: '#38bdf8' },
  oops:          { name: 'OOPs',          icon: '🧩', color: '#c084fc' }
};

// ═══ State ═══════════════════════════════════════════════════
let currentUser   = null;
let currentLevel  = localStorage.getItem('dsa_level') || null;
let questionsData = null;
let progressData  = {};

// ═══ JWT Helpers ══════════════════════════════════════════════

function getToken() {
  return localStorage.getItem('dsa_token');
}

function saveToken(token) {
  localStorage.setItem('dsa_token', token);
}

/**
 * Decode the JWT payload without verifying the signature.
 * Used only for reading user data client-side (display purposes).
 * All sensitive operations go through the backend which verifies the token.
 */
function decodeToken() {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    // Reject if expired
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

/**
 * fetch() wrapper that automatically adds Authorization: Bearer <token>.
 * Use this for every API call that requires authentication.
 */
function authFetch(url, options = {}) {
  const token = getToken();
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
}

// ═══ Utilities ════════════════════════════════════════════════
function showToast(message, duration = 3000) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

function getUrlParam(key) {
  return new URLSearchParams(window.location.search).get(key);
}

function getProgress(sectionKey) {
  const level           = currentLevel || 'beginner';
  const sectionProgress = progressData[sectionKey] || {};
  const questions       = questionsData?.[sectionKey]?.[level] || [];
  const total           = questions.length;
  const done            = questions.filter(q => sectionProgress[q.id] === 'done').length;
  return { total, done, percentage: total > 0 ? Math.round((done / total) * 100) : 0 };
}

// ═══ Auth ═════════════════════════════════════════════════════

/**
 * Load the current user from the stored JWT (no network call).
 * Also syncs currentLevel from the token if localStorage is empty.
 */
function loadUserFromToken() {
  const payload = decodeToken();
  if (!payload) return null;

  currentUser = payload;
  if (payload.level && !currentLevel) {
    currentLevel = payload.level;
    localStorage.setItem('dsa_level', currentLevel);
  }
  return currentUser;
}

function handleGoogleLogin() {
  window.location.href = `${API_BASE}/auth/google`;
}

function handleLogout() {
  // JWT is stateless — just clear local storage
  localStorage.removeItem('dsa_token');
  localStorage.removeItem('dsa_level');
  localStorage.removeItem('dsa_progress');
  window.location.href = 'index.html';
}

// ═══ Level Selection ══════════════════════════════════════════
function selectLevel(el) {
  document.querySelectorAll('.level-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  const btn = document.getElementById('level-continue-btn');
  if (btn) btn.disabled = false;
}

async function confirmLevel() {
  const selected = document.querySelector('.level-card.selected');
  if (!selected) return;

  const btn = document.getElementById('level-continue-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

  currentLevel = selected.dataset.level;
  localStorage.setItem('dsa_level', currentLevel);

  // Save to backend — response includes a new token with the level embedded
  try {
    const res  = await authFetch(`${API_BASE}/level`, {
      method: 'POST',
      body:   JSON.stringify({ level: currentLevel })
    });
    const data = await res.json();
    if (data.token) saveToken(data.token); // refresh token with level inside
  } catch (_) { /* continue offline */ }

  window.location.href = 'dashboard.html';
}

// ═══ Data Loading ═════════════════════════════════════════════
async function loadQuestions() {
  if (questionsData) return questionsData;

  try {
    const res = await fetch(`${API_BASE}/questions`);
    if (res.ok) { questionsData = await res.json(); return questionsData; }
  } catch (_) {}

  try {
    const res = await fetch('../backend/data/questions.json');
    if (res.ok) { questionsData = await res.json(); return questionsData; }
  } catch (_) {}

  console.warn('Could not load questions data');
  return null;
}

function loadProgress() {
  const stored = localStorage.getItem('dsa_progress');
  progressData = stored ? JSON.parse(stored) : {};
  return progressData;
}

function saveProgress() {
  localStorage.setItem('dsa_progress', JSON.stringify(progressData));
}

async function syncProgressFromBackend() {
  try {
    const res = await authFetch(`${API_BASE}/progress`);
    if (!res.ok) return;
    const backendProgress = await res.json();

    Object.entries(backendProgress).forEach(([section, questions]) => {
      if (!progressData[section]) progressData[section] = {};
      Object.assign(progressData[section], questions);
    });
    saveProgress();
  } catch (_) { /* offline — use localStorage */ }
}

// ═══ Dashboard ════════════════════════════════════════════════
async function initDashboard() {
  // Returning users arrive here via ?token= from the OAuth callback redirect
  const tokenParam = getUrlParam('token');
  if (tokenParam) {
    saveToken(tokenParam);
    history.replaceState({}, '', 'dashboard.html'); // clean URL
  }

  // Hydrate user from JWT (no network call needed)
  loadUserFromToken();

  if (!currentLevel) {
    window.location.href = 'index.html';
    return;
  }

  // Render immediately with local data
  loadProgress();
  await loadQuestions();
  renderSectionCards();

  // Personalized greeting
  const greeting = document.getElementById('greeting');
  if (greeting) {
    const hour         = new Date().getHours();
    const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const firstName    = currentUser?.name?.split(' ')[0] || '';
    greeting.textContent = firstName ? `${timeGreeting}, ${firstName}` : timeGreeting;
  }

  // Populate navbar avatar & name
  const navUserName = document.getElementById('nav-user-name');
  const navAvatar   = document.getElementById('nav-user-avatar');
  if (navUserName && currentUser) navUserName.textContent = currentUser.name?.split(' ')[0] || '';
  if (navAvatar   && currentUser) navAvatar.textContent   = (currentUser.name?.[0] || '?').toUpperCase();

  highlightSidebar('dashboard.html');

  // Background: sync progress from backend then re-render
  syncProgressFromBackend().then(() => renderSectionCards());

  // Background: load streak
  loadStreak();
}

function renderSectionCards() {
  const grid = document.getElementById('section-grid');
  if (!grid) return;

  grid.innerHTML = '';

  Object.entries(SECTIONS).forEach(([key, section]) => {
    const { total, done, percentage } = getProgress(key);

    const card = document.createElement('div');
    card.className = 'section-card';
    card.onclick   = () => window.location.href = `section.html?section=${key}`;
    card.innerHTML = `
      <div class="section-card-header">
        <div>
          <div class="section-card-name">${section.name}</div>
          <div class="section-card-meta">${done} / ${total} problems</div>
        </div>
        <span class="section-card-percentage">${percentage}%</span>
      </div>
      <div class="progress-bar">
        <div class="progress-bar-fill" style="width: ${percentage}%"></div>
      </div>
    `;
    grid.appendChild(card);
  });
}

// ─── Streak ──────────────────────────────────────────────────
async function loadStreak() {
  try {
    const res = await authFetch(`${API_BASE}/streak`);
    if (!res.ok) return;
    renderStreak(await res.json());
  } catch (_) {}
}

function renderStreak(streak) {
  const subtitle = document.querySelector('.dashboard-subtitle');
  if (!subtitle) return;
  if (streak.current_streak > 0) {
    subtitle.textContent = `🔥 ${streak.current_streak}-day streak! Keep it going.`;
  }
}

// ═══ Section / Question List ══════════════════════════════════
async function initSection() {
  if (!currentLevel) {
    // Try loading from token before giving up
    loadUserFromToken();
    if (!currentLevel) { window.location.href = 'index.html'; return; }
  }

  const sectionKey = getUrlParam('section') || 'dsa';
  const section    = SECTIONS[sectionKey];
  if (!section) { window.location.href = 'dashboard.html'; return; }

  loadProgress();
  await loadQuestions();

  const title = document.getElementById('section-title');
  if (title) title.textContent = `${section.icon} ${section.name}`;

  highlightSidebar(`section.html?section=${sectionKey}`);
  highlightBottomNav(`section.html?section=${sectionKey}`);

  renderQuestionList(sectionKey);
  updateSectionSummary(sectionKey);

  syncProgressFromBackend().then(() => {
    renderQuestionList(sectionKey);
    updateSectionSummary(sectionKey);
  });
}

function renderQuestionList(sectionKey) {
  const list = document.getElementById('question-list');
  if (!list || !questionsData) return;

  const questions       = questionsData[sectionKey]?.[currentLevel] || [];
  const sectionProgress = progressData[sectionKey] || {};

  list.innerHTML = '';

  questions.forEach((q, i) => {
    const status = sectionProgress[q.id] || 'todo';
    const row    = document.createElement('div');
    row.className = 'question-row';
    row.innerHTML = `
      <div class="question-number">${i + 1}</div>
      <div class="question-info">
        <a href="${q.link}" target="_blank" rel="noopener" class="question-title"
           style="color: inherit; text-decoration: none;">${q.title}</a>
        <div class="question-meta">
          <span class="difficulty-badge ${q.difficulty}">${q.difficulty}</span>
          <span class="topic-badge">${q.topic}</span>
        </div>
      </div>
      <div class="status-buttons">
        <button class="status-btn todo ${status === 'todo'     ? 'active' : ''}"
                onclick="setStatus('${sectionKey}', '${q.id}', 'todo', event)">To Do</button>
        <button class="status-btn progress ${status === 'progress' ? 'active' : ''}"
                onclick="setStatus('${sectionKey}', '${q.id}', 'progress', event)">In Progress</button>
        <button class="status-btn done ${status === 'done'     ? 'active' : ''}"
                onclick="setStatus('${sectionKey}', '${q.id}', 'done', event)">Done</button>
      </div>
    `;
    list.appendChild(row);
  });
}

async function setStatus(sectionKey, questionId, status, event) {
  if (event) event.stopPropagation();

  // Optimistic update — UI responds instantly
  if (!progressData[sectionKey]) progressData[sectionKey] = {};
  progressData[sectionKey][questionId] = status;
  saveProgress();
  renderQuestionList(sectionKey);
  updateSectionSummary(sectionKey);

  const labels = { todo: 'To Do', progress: 'In Progress', done: 'Done ✓' };
  showToast(`Marked as ${labels[status]}`);

  // Persist to backend in the background
  authFetch(`${API_BASE}/progress`, {
    method: 'POST',
    body:   JSON.stringify({ section: sectionKey, questionId, status })
  }).catch(() => {});
}

function updateSectionSummary(sectionKey) {
  const { total, done, percentage } = getProgress(sectionKey);

  const progressRing  = document.getElementById('progress-ring');
  const progressText  = document.getElementById('progress-text');
  const summaryTitle  = document.getElementById('summary-title');
  const summaryDetail = document.getElementById('summary-detail');

  if (progressRing) {
    const circumference = 2 * Math.PI * 24;
    progressRing.style.strokeDashoffset = circumference - (percentage / 100) * circumference;
  }
  if (progressText)  progressText.textContent  = `${percentage}%`;
  if (summaryTitle)  summaryTitle.textContent   = `${SECTIONS[sectionKey]?.name} — ${currentLevel}`;
  if (summaryDetail) summaryDetail.textContent  = `${done} / ${total} completed`;
}

// ═══ Navigation Helpers ═══════════════════════════════════════
function highlightSidebar(href) {
  document.querySelectorAll('.sidebar-nav-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('href') === href);
  });
}

function highlightBottomNav(href) {
  document.querySelectorAll('.bottom-nav-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('href') === href);
  });
}

// ═══ Landing Page (index.html) ════════════════════════════════
(function initLanding() {
  const landingPage = document.getElementById('landing-page');
  if (!landingPage) return; // Not on index.html

  const levelPage = document.getElementById('level-page');
  const authParam = getUrlParam('auth');

  // ── OAuth just completed ──────────────────────────────────
  if (authParam === 'success') {
    // Save the JWT that arrived with the redirect
    const tokenParam = getUrlParam('token');
    if (tokenParam) saveToken(tokenParam);
    history.replaceState({}, '', 'index.html'); // clean URL

    // Show level selection (embedded in index.html)
    landingPage.style.display = 'none';
    if (levelPage) levelPage.style.display = 'flex';
    return;
  }

  if (authParam === 'failed') {
    const errEl = document.getElementById('auth-error');
    if (errEl) errEl.style.display = 'block';
    return;
  }

  // ── Normal visit ──────────────────────────────────────────
  // Already logged in (valid token + level) → skip to dashboard
  if (getToken() && (currentLevel || decodeToken()?.level)) {
    window.location.href = 'dashboard.html';
    return;
  }
  // Otherwise show the login page (already visible by default)
})();
