/* ============================================================
   DSA Sheet by Shwetank — Frontend Application Logic
   ============================================================ */

// ═══ Configuration ═══════════════════════════════════════════
// Local dev (served from backend on :3001) → absolute URL avoids any port mismatch.
// Production on Netlify → relative /api is rewritten by the netlify.toml proxy.
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
let currentUser  = null;
let currentLevel = localStorage.getItem('dsa_level') || null;
let questionsData = null;
let progressData  = {};

// ═══ Utilities ═══════════════════════════════════════════════
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
 * Fetch the current session user from the backend.
 * Syncs level to localStorage when the backend has one we don't.
 */
async function fetchUser() {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.authenticated) {
      currentUser = data.user;
      if (data.user.level && !currentLevel) {
        currentLevel = data.user.level;
        localStorage.setItem('dsa_level', currentLevel);
      }
      return currentUser;
    }
  } catch (_) { /* offline / no backend */ }
  return null;
}

function handleGoogleLogin() {
  window.location.href = `${API_BASE}/auth/google`;
}

async function handleLogout() {
  try {
    await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
  } catch (_) { /* continue even if request fails */ }
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

  // Save to backend, then redirect
  try {
    await fetch(`${API_BASE}/level`, {
      method:      'POST',
      headers:     { 'Content-Type': 'application/json' },
      credentials: 'include',
      body:        JSON.stringify({ level: currentLevel })
    });
  } catch (_) { /* continue even if backend is unreachable */ }

  window.location.href = 'dashboard.html';
}

// ═══ Data Loading ══════════════════════════════════════════════
async function loadQuestions() {
  if (questionsData) return questionsData;

  // Try backend first, fall back to local JSON file
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
  const stored  = localStorage.getItem('dsa_progress');
  progressData  = stored ? JSON.parse(stored) : {};
  return progressData;
}

function saveProgress() {
  localStorage.setItem('dsa_progress', JSON.stringify(progressData));
}

/** Fetch all progress from the backend and merge over the local cache. */
async function syncProgressFromBackend() {
  try {
    const res = await fetch(`${API_BASE}/progress`, { credentials: 'include' });
    if (!res.ok) return;
    const backendProgress = await res.json();

    // Backend is source of truth — merge into progressData
    Object.entries(backendProgress).forEach(([section, questions]) => {
      if (!progressData[section]) progressData[section] = {};
      Object.assign(progressData[section], questions);
    });

    saveProgress();
  } catch (_) { /* offline — use localStorage */ }
}

// ═══ Dashboard ════════════════════════════════════════════════
async function initDashboard() {
  // Returning users arrive here via ?level=xxx from the OAuth callback
  const levelParam = getUrlParam('level');
  if (levelParam && !currentLevel) {
    currentLevel = levelParam;
    localStorage.setItem('dsa_level', currentLevel);
    // Clean the URL without reloading
    history.replaceState({}, '', 'dashboard.html');
  }

  // Render skeleton → real data as quickly as possible
  loadProgress();
  await loadQuestions();
  renderSectionCards();

  // Hydrate user from session (also fills currentLevel if missing)
  await fetchUser();

  if (!currentLevel) {
    window.location.href = 'index.html';
    return;
  }

  // Personalized greeting
  const greeting = document.getElementById('greeting');
  if (greeting) {
    const hour          = new Date().getHours();
    const timeGreeting  = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const firstName     = currentUser?.name?.split(' ')[0] || '';
    greeting.textContent = firstName
      ? `${timeGreeting}, ${firstName}`
      : timeGreeting;
  }

  // Populate navbar avatar & name
  const navUserName = document.getElementById('nav-user-name');
  const navAvatar   = document.getElementById('nav-user-avatar');
  if (navUserName && currentUser) navUserName.textContent = currentUser.name?.split(' ')[0] || '';
  if (navAvatar && currentUser) navAvatar.textContent = (currentUser.name?.[0] || '?').toUpperCase();

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
    const res = await fetch(`${API_BASE}/streak`, { credentials: 'include' });
    if (!res.ok) return;
    const streak = await res.json();
    renderStreak(streak);
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
    window.location.href = 'index.html';
    return;
  }

  const sectionKey = getUrlParam('section') || 'dsa';
  const section    = SECTIONS[sectionKey];
  if (!section) {
    window.location.href = 'dashboard.html';
    return;
  }

  loadProgress();
  await loadQuestions();

  const title = document.getElementById('section-title');
  if (title) title.textContent = `${section.icon} ${section.name}`;

  highlightSidebar(`section.html?section=${sectionKey}`);
  highlightBottomNav(`section.html?section=${sectionKey}`);

  renderQuestionList(sectionKey);
  updateSectionSummary(sectionKey);

  // Background: sync this section's progress from backend
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
  fetch(`${API_BASE}/progress`, {
    method:      'POST',
    headers:     { 'Content-Type': 'application/json' },
    credentials: 'include',
    body:        JSON.stringify({ section: sectionKey, questionId, status })
  }).catch(() => {});
}

function updateSectionSummary(sectionKey) {
  const { total, done, percentage } = getProgress(sectionKey);

  const progressRing  = document.getElementById('progress-ring');
  const progressText  = document.getElementById('progress-text');
  const summaryTitle  = document.getElementById('summary-title');
  const summaryDetail = document.getElementById('summary-detail');

  if (progressRing) {
    const circumference = 2 * Math.PI * 24; // r = 24
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

  const levelPage  = document.getElementById('level-page');
  const authParam  = getUrlParam('auth');

  // ── Handle OAuth result first (takes priority over everything) ──
  if (authParam === 'success') {
    // New user just logged in — redirect to level selection page
    window.location.href = 'level-select.html';
    return;
  }

  if (authParam === 'failed') {
    // Show error message on the login page
    const errEl = document.getElementById('auth-error');
    if (errEl) errEl.style.display = 'block';
    return;
  }

  // ── No auth param — normal landing page visit ──
  // If user already has a level cached, skip login and go to dashboard
  if (currentLevel) {
    window.location.href = 'dashboard.html';
    return;
  }
  // Otherwise show the default login page (already visible)
})();

// ═══ Level Select Page (level-select.html) ════════════════════
function initLevelSelect() {
  // Already have a level → skip straight to dashboard
  if (currentLevel) {
    window.location.href = 'dashboard.html';
    return;
  }
}
