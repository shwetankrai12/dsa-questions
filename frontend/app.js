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
  renderPlayerLevel();

  // Arcade greeting
  const greeting    = document.getElementById('greeting');
  const playerName  = document.getElementById('player-name');
  const subtitle    = document.getElementById('dashboard-subtitle');
  const hour        = new Date().getHours();
  const timePhrase  = hour < 12 ? 'GOOD MORNING' : hour < 17 ? 'GOOD AFTERNOON' : 'GOOD EVENING';
  const firstName   = currentUser?.name?.split(' ')[0]?.toUpperCase() || 'PLAYER';
  if (greeting)   greeting.textContent   = 'PLAYER 1';
  if (playerName) playerName.textContent = firstName;
  if (subtitle)   subtitle.textContent   = timePhrase + ' — PICK UP WHERE YOU LEFT OFF.';

  // Populate navbar avatar & name
  const navUserName = document.getElementById('nav-user-name');
  const navAvatar   = document.getElementById('nav-user-avatar');
  if (navUserName && currentUser) navUserName.textContent = currentUser.name?.split(' ')[0] || '';
  if (navAvatar   && currentUser) navAvatar.textContent   = (currentUser.name?.[0] || '?').toUpperCase();

  highlightSidebar('dashboard.html');

  // Background: sync progress from backend then re-render
  syncProgressFromBackend().then(() => { renderSectionCards(); renderPlayerLevel(); });

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
          <div class="section-card-meta">${done} / ${total} enemies defeated</div>
        </div>
        <span class="section-card-percentage">${percentage}%</span>
      </div>
      <div class="progress-bar">
        <div class="progress-bar-fill" style="width: ${percentage}%"></div>
      </div>
      <div class="section-card-enter">ENTER ▶</div>
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

// ── Question Filter ───────────────────────────────────────────
let questionFilter = 'all';

function setQuestionFilter(filter, chipEl) {
  questionFilter = filter;

  // Update chip active state
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  if (chipEl) chipEl.classList.add('active');

  // Toggle visibility on existing rows without a full re-render
  document.querySelectorAll('#question-list .question-row').forEach(row => {
    const buttons   = row.querySelectorAll('.status-btn');
    let   rowStatus = 'todo';
    buttons.forEach(btn => {
      if (btn.classList.contains('active')) {
        if (btn.classList.contains('progress')) rowStatus = 'progress';
        else if (btn.classList.contains('done')) rowStatus = 'done';
        else rowStatus = 'todo';
      }
    });
    if (filter === 'all' || rowStatus === filter) row.classList.remove('q-hidden');
    else row.classList.add('q-hidden');
  });
}

// ── Player Level / XP ─────────────────────────────────────────
function renderPlayerLevel() {
  if (!questionsData) return;
  const level = currentLevel || 'beginner';
  const xpMap = { easy: 10, medium: 25, hard: 50 };
  let totalSolved = 0;
  let totalXP     = 0;

  Object.keys(SECTIONS).forEach(key => {
    const questions    = questionsData[key]?.[level] || [];
    const sectionProg  = progressData[key] || {};
    questions.forEach(q => {
      if (sectionProg[q.id] === 'done') {
        totalSolved++;
        totalXP += xpMap[q.difficulty] || 10;
      }
    });
  });

  const playerLevel     = Math.floor(totalSolved / 10) + 1;
  const solvedInLevel   = totalSolved % 10;
  const progressPct     = solvedInLevel * 10;

  const levelEl = document.getElementById('player-level');
  if (levelEl) {
    const numEl = levelEl.querySelector('.player-level-num');
    if (numEl) numEl.textContent = `LV${playerLevel}`;
  }

  const xpFill = document.getElementById('xp-bar-fill');
  if (xpFill) xpFill.style.width = `${progressPct}%`;

  const xpLeft = document.getElementById('xp-label-left');
  if (xpLeft) xpLeft.textContent = `${totalXP} XP EARNED`;

  const xpRight = document.getElementById('xp-label-right');
  if (xpRight) xpRight.textContent = `LV${playerLevel + 1}: ${solvedInLevel}/10 SOLVED`;
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

  const bc = document.getElementById('section-title-bc');
  if (bc) bc.textContent = section.name.toUpperCase();

  // Reset filter
  questionFilter = 'all';

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
  const xpMap           = { easy: 10, medium: 25, hard: 50 };

  list.innerHTML = '';

  questions.forEach((q, i) => {
    const status  = sectionProgress[q.id] || 'todo';
    const isBoss  = (i + 1) % 8 === 0;
    const xp      = isBoss ? 100 : (xpMap[q.difficulty] || 10);
    const num     = i + 1;

    const row = document.createElement('div');
    row.className = 'question-row';
    if (status === 'progress') row.classList.add('status-progress');
    if (status === 'done')     row.classList.add('status-done');
    if (isBoss)                row.classList.add('boss-battle');

    // Filter visibility
    if (questionFilter !== 'all' && status !== questionFilter) row.classList.add('q-hidden');

    // Number cell classes
    let numClass = 'question-number';
    if (isBoss)               numClass += ' num-boss';
    else if (status === 'progress') numClass += ' num-fighting';
    else if (status === 'done')     numClass += ' num-done';

    const numLabel = isBoss ? `BOSS<br>${num}` : num;

    // Extra badges
    const bossBadge = isBoss ? `<span class="boss-badge">⚔ BOSS</span>` : '';
    const xpBadge   = `<span class="xp-badge">+${xp} XP</span>`;

    row.innerHTML = `
      <div class="${numClass}">${numLabel}</div>
      <div class="question-info">
        <a href="${q.link}" target="_blank" rel="noopener" class="question-title">${q.title}</a>
        <div class="question-meta">
          <span class="difficulty-badge ${q.difficulty}">${q.difficulty}</span>
          <span class="topic-badge">${q.topic}</span>
          ${bossBadge}
          ${xpBadge}
        </div>
      </div>
      <div class="status-buttons">
        <button class="status-btn todo ${status === 'todo'     ? 'active' : ''}"
                onclick="setStatus('${sectionKey}', '${q.id}', 'todo', event)">TO DO</button>
        <button class="status-btn progress ${status === 'progress' ? 'active' : ''}"
                onclick="setStatus('${sectionKey}', '${q.id}', 'progress', event)">FIGHTING</button>
        <button class="status-btn done ${status === 'done'     ? 'active' : ''}"
                onclick="setStatus('${sectionKey}', '${q.id}', 'done', event)">DEFEATED</button>
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

  const labels = { todo: 'TO DO', progress: 'FIGHTING ⚔', done: 'DEFEATED ✓' };
  showToast(labels[status]);

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
  if (summaryDetail) summaryDetail.textContent  = `${done} / ${total} defeated`;
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

// ═══ Notes ════════════════════════════════════════════════════

const NOTES_KEY       = 'dsa_notes';
const NOTES_MAX       = 50;
const NOTE_FILE_LIMIT = 5 * 1024 * 1024;   // 5 MB per file
const NOTES_LS_WARN   = 4;                  // warn at 4 MB total localStorage

function loadNotes() {
  try { return JSON.parse(localStorage.getItem(NOTES_KEY) || '[]'); } catch (_) { return []; }
}

function saveNotes(notes) {
  localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
}

function getLocalStorageMB() {
  let bytes = 0;
  for (const key in localStorage) {
    if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
      bytes += (key.length + (localStorage.getItem(key) || '').length) * 2;
    }
  }
  return bytes / (1024 * 1024);
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ── Init Notes Page ───────────────────────────────────────────
function initNotes() {
  loadUserFromToken();

  if (!currentUser) {
    window.location.href = 'index.html';
    return;
  }

  // Populate navbar
  const navUserName = document.getElementById('nav-user-name');
  const navAvatar   = document.getElementById('nav-user-avatar');
  if (navUserName && currentUser) navUserName.textContent = currentUser.name?.split(' ')[0] || '';
  if (navAvatar   && currentUser) navAvatar.textContent   = (currentUser.name?.[0] || '?').toUpperCase();

  // Mark active nav link
  document.querySelectorAll('.navbar-link').forEach(el => {
    el.classList.toggle('active', el.getAttribute('href') === 'notes.html');
  });

  const uploadZone = document.getElementById('notes-upload-zone');
  const fileInput  = document.getElementById('notes-file-input');
  if (!uploadZone || !fileInput) return;

  // Click to browse
  uploadZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => {
    handleNotesFiles(e.target.files);
    fileInput.value = '';
  });

  // Drag & drop
  uploadZone.addEventListener('dragover', e => {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
  });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
  uploadZone.addEventListener('drop', e => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    handleNotesFiles(e.dataTransfer.files);
  });

  renderNotes();
}

function handleNotesFiles(files) {
  Array.from(files).forEach(file => {
    const notes = loadNotes();
    if (notes.length >= NOTES_MAX) { showToast('Maximum 50 notes reached'); return; }

    if (file.size > NOTE_FILE_LIMIT) {
      showToast(`${file.name}: file exceeds 5 MB limit`);
      return;
    }

    const isImage = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
    const isPDF   = file.type === 'application/pdf';

    if (!isImage && !isPDF) {
      showToast(`${file.name}: unsupported type (JPG, PNG, WEBP, PDF only)`);
      return;
    }

    const reader = new FileReader();
    reader.onload = ev => {
      const fresh = loadNotes();
      if (fresh.length >= NOTES_MAX) return;

      fresh.push({
        id:         `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        title:      file.name.replace(/\.[^.]+$/, ''),
        data:       ev.target.result,
        type:       isPDF ? 'pdf' : 'image',
        uploadedAt: new Date().toISOString()
      });

      saveNotes(fresh);

      if (getLocalStorageMB() > NOTES_LS_WARN) {
        showToast('Warning: storage usage exceeds 4 MB — consider deleting old notes');
      }

      renderNotes();
    };
    reader.readAsDataURL(file);
  });
}

function renderNotes() {
  const grid = document.getElementById('notes-grid');
  if (!grid) return;

  const notes = loadNotes();
  grid.innerHTML = '';

  if (notes.length === 0) {
    grid.innerHTML = '<p class="notes-empty">No notes yet. Upload your first note above.</p>';
    return;
  }

  notes.forEach(note => {
    const card     = document.createElement('div');
    card.className = 'note-card';

    const dateStr = new Date(note.uploadedAt).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });

    const thumbHTML = note.type === 'image'
      ? `<img src="${note.data}" alt="${escapeHtml(note.title)}" loading="lazy">`
      : `<div class="note-pdf-icon"><span style="font-size:32px">📄</span><span>PDF</span></div>`;

    card.innerHTML = `
      <div class="note-thumbnail" data-noteid="${note.id}">${thumbHTML}</div>
      <div class="note-footer">
        <input class="note-title-input" type="text" value="${escapeHtml(note.title)}"
               data-noteid="${note.id}" spellcheck="false">
        <div class="note-meta-row">
          <span class="note-date">${dateStr}</span>
          <button class="note-delete-btn" data-noteid="${note.id}">Delete</button>
        </div>
      </div>`;

    card.querySelector('.note-thumbnail').addEventListener('click', () => openLightbox(note.id));

    card.querySelector('.note-title-input').addEventListener('change', function () {
      updateNoteTitle(this.dataset.noteid, this.value);
    });

    card.querySelector('.note-delete-btn').addEventListener('click', e => {
      e.stopPropagation();
      deleteNote(note.id);
    });

    grid.appendChild(card);
  });
}

function updateNoteTitle(id, title) {
  const notes = loadNotes();
  const note  = notes.find(n => n.id === id);
  if (note) { note.title = title.trim() || 'Untitled'; saveNotes(notes); }
}

function deleteNote(id) {
  saveNotes(loadNotes().filter(n => n.id !== id));
  renderNotes();
  showToast('Note deleted');
}

// ── Lightbox ──────────────────────────────────────────────────
function openLightbox(id) {
  const note = loadNotes().find(n => n.id === id);
  if (!note) return;

  const overlay = document.getElementById('lightbox');
  const body    = document.getElementById('lightbox-body');
  body.innerHTML = '';

  if (note.type === 'image') {
    const img = document.createElement('img');
    img.className = 'lightbox-img';
    img.src       = note.data;
    img.alt       = note.title;
    initImageZoom(img);
    body.appendChild(img);
  } else {
    const frame     = document.createElement('iframe');
    frame.className = 'lightbox-pdf';
    frame.src       = note.data;
    frame.title     = note.title;
    body.appendChild(frame);
  }

  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  const overlay = document.getElementById('lightbox');
  if (!overlay) return;
  overlay.classList.remove('open');
  document.body.style.overflow = '';
  const body = document.getElementById('lightbox-body');
  if (body) body.innerHTML = '';
}

// Mouse-wheel zoom + drag pan + pinch-to-zoom for lightbox images
function initImageZoom(img) {
  let scale = 1, tx = 0, ty = 0;
  let dragging = false, startX = 0, startY = 0, originTx = 0, originTy = 0;

  function applyTransform() {
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }

  img.addEventListener('wheel', e => {
    e.preventDefault();
    scale = Math.min(8, Math.max(1, scale - e.deltaY * 0.001));
    if (scale === 1) { tx = 0; ty = 0; }
    applyTransform();
  }, { passive: false });

  img.addEventListener('mousedown', e => {
    if (scale <= 1) return;
    dragging = true; img.classList.add('grabbing');
    startX = e.clientX; startY = e.clientY;
    originTx = tx; originTy = ty;
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    tx = originTx + (e.clientX - startX);
    ty = originTy + (e.clientY - startY);
    applyTransform();
  });
  document.addEventListener('mouseup', () => {
    dragging = false;
    img.classList.remove('grabbing');
  });

  // Pinch-to-zoom (touch)
  let initDist = 0, initScale = 1;
  img.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      initDist  = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY
      );
      initScale = scale;
    }
  }, { passive: true });
  img.addEventListener('touchmove', e => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY
      );
      scale = Math.min(8, Math.max(1, initScale * (dist / initDist)));
      if (scale === 1) { tx = 0; ty = 0; }
      applyTransform();
    }
  }, { passive: false });
}

// ═══ Streak ═══════════════════════════════════════════════════

const STREAK_KEY = 'dsa_streak_data';

let streakCalYear  = new Date().getFullYear();
let streakCalMonth = new Date().getMonth();
let streakActiveDate = null;   // currently-open day panel

// Topic hints — shown in the question panel (conceptual, no spoilers)
const TOPIC_HINTS = {
  'arrays':              'Think about traversal patterns. Two-pointer or prefix-sum techniques often turn O(n²) into O(n).',
  'sliding-window':      'Maintain a window that expands/contracts. Track the window state with a counter or hashmap.',
  'binary-search':       'Define your search space precisely, then ask: can I eliminate the left half or the right half?',
  'stacks':              'A stack shines when the most-recently-seen element affects the current decision.',
  'queues':              'Queues process elements in arrival order — useful for BFS and level-order traversal.',
  'linked-list':         'Draw the pointer manipulation step by step. Slow/fast pointers handle cycle and midpoint problems.',
  'trees':               'Decide between DFS (recursion/stack) and BFS (queue). Define your base case clearly.',
  'graphs':              'Mark visited nodes to avoid revisiting. BFS for shortest paths, DFS for connectivity/cycle detection.',
  'dynamic-programming': 'Define state, write the recurrence, then choose top-down (memo) or bottom-up (tabulation).',
  'hash-table':          'Hashing turns O(n) lookup into O(1). Trade space for time.',
  'two-pointers':        'Sort first if needed, then move pointers inward based on the sum/condition at each step.',
  'backtracking':        'Build candidates incrementally, pruning branches that can\'t possibly lead to a valid solution.',
  'heap':                'A heap gives O(log n) access to the min/max — ideal for k-th element and merge-k problems.',
  'trie':                'Tries accelerate shared-prefix operations. Build character-by-character, query the same way.',
  'bit-manipulation':    'XOR cancels equal bits. AND/OR/shift often replace expensive arithmetic or counting loops.',
  'math':                'Look for patterns, modular arithmetic, or a closed-form formula before reaching for brute force.',
  'strings':             'Frequency maps and sliding window cover most substring problems. Think about character counts.',
  'matrix':              'Flatten to 1D indices or simulate with a direction array [up, down, left, right].',
  'intervals':           'Sort by start time, then scan linearly — overlaps collapse when end[i] >= start[i+1].',
  'greedy':              'Make the locally optimal choice at each step; prove it leads to the global optimum.',
  'design':              'Identify core operations, then pick data structures that make each one O(1) or O(log n).',
  'segment-tree':        'Range queries in O(log n): build the tree once, then query or update in O(log n).',
  'deque':               'A deque supports O(1) push/pop at both ends — the key to sliding-window maximum.',
  'concurrency':         'Identify shared state and use locks or atomic operations to prevent data races.',
  'backtracking':        'Explore all paths, undo choices when they lead to dead ends (the "undo" step is the trick).',
  'binary-search':       'Reduce the search space by half each iteration. Works on any monotone condition, not just sorted arrays.',
  'greedy':              'Sort your input, then make the cheapest (or most profitable) local decision at each step.',
  'sorting':             'Know your sort algorithms — for custom ordering, a comparator function unlocks most solutions.',
};

function loadStreakData() {
  try { return JSON.parse(localStorage.getItem(STREAK_KEY) || '{}'); } catch (_) { return {}; }
}

function saveStreakData(data) {
  localStorage.setItem(STREAK_KEY, JSON.stringify(data));
}

function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function todayKey() { return dateKey(new Date()); }

// Deterministic question picker: same date always returns same question
function getQuestionForDate(year, month1, day) {
  const dsa = questionsData?.dsa;
  if (!dsa) return null;
  const all = [
    ...(dsa.beginner    || []),
    ...(dsa.intermediate || []),
    ...(dsa.advanced    || [])
  ];
  if (!all.length) return null;
  // seed uses 1-indexed month (month1)
  const seed = year * 10000 + month1 * 100 + day;
  const idx  = Math.abs(Math.round(seed * 1103515245 + 12345)) % all.length;
  return all[idx];
}

// Current streak: count consecutive done-days backwards from today.
// Grace period: if today is not yet done, still show yesterday's chain.
function calcCurrentStreak(data) {
  let streak = 0;
  const d = new Date();
  if (!data[dateKey(d)]?.done) d.setDate(d.getDate() - 1);   // grace
  while (true) {
    const k = dateKey(d);
    if (data[k]?.done) { streak++; d.setDate(d.getDate() - 1); }
    else break;
  }
  return streak;
}

function calcLongestStreak(data) {
  const doneDates = Object.keys(data).filter(k => data[k]?.done).sort();
  if (!doneDates.length) return 0;
  let longest = 1, cur = 1;
  for (let i = 1; i < doneDates.length; i++) {
    const diff = (new Date(doneDates[i]) - new Date(doneDates[i - 1])) / 86400000;
    if (diff === 1) { cur++; if (cur > longest) longest = cur; }
    else cur = 1;
  }
  return longest;
}

function calcThisMonth(data) {
  const now     = new Date();
  const y       = now.getFullYear();
  const m       = now.getMonth() + 1;   // 1-indexed
  const elapsed = now.getDate();
  let done = 0;
  for (let d = 1; d <= elapsed; d++) {
    const k = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    if (data[k]?.done) done++;
  }
  return { done, total: elapsed };
}

// ── Init ──────────────────────────────────────────────────────
async function initStreak() {
  loadUserFromToken();
  if (!currentUser) { window.location.href = 'index.html'; return; }

  const navUserName = document.getElementById('nav-user-name');
  const navAvatar   = document.getElementById('nav-user-avatar');
  if (navUserName) navUserName.textContent = currentUser.name?.split(' ')[0] || '';
  if (navAvatar)   navAvatar.textContent   = (currentUser.name?.[0] || '?').toUpperCase();

  document.querySelectorAll('.navbar-link').forEach(el => {
    el.classList.toggle('active', el.getAttribute('href') === 'streak.html');
  });

  await loadQuestions();

  renderStreakStats();
  renderCalendar(streakCalYear, streakCalMonth);

  // Auto-show today's question on load (without marking as visited)
  const tk = todayKey();
  streakActiveDate = tk;
  renderDayPanel(tk);

  document.getElementById('cal-prev')?.addEventListener('click', () => {
    if (streakCalMonth === 0) { streakCalYear--; streakCalMonth = 11; }
    else streakCalMonth--;
    renderCalendar(streakCalYear, streakCalMonth);
  });

  document.getElementById('cal-next')?.addEventListener('click', () => {
    const now = new Date();
    if (streakCalYear === now.getFullYear() && streakCalMonth === now.getMonth()) return;
    if (streakCalMonth === 11) { streakCalYear++; streakCalMonth = 0; }
    else streakCalMonth++;
    renderCalendar(streakCalYear, streakCalMonth);
  });
}

// ── Render Stats ──────────────────────────────────────────────
function renderStreakStats() {
  const el = document.getElementById('streak-stats');
  if (!el) return;

  const data                  = loadStreakData();
  const cur                   = calcCurrentStreak(data);
  const lng                   = calcLongestStreak(data);
  const { done, total }       = calcThisMonth(data);

  el.innerHTML = `
    <div class="streak-stat-card" data-accent="pink">
      <div class="streak-stat-value">${cur > 0 ? '🔥' : ''}${cur}</div>
      <div class="streak-stat-label">CURRENT FLAME</div>
    </div>
    <div class="streak-stat-card" data-accent="yellow">
      <div class="streak-stat-value">${lng}</div>
      <div class="streak-stat-label">HIGH SCORE</div>
    </div>
    <div class="streak-stat-card" data-accent="cyan">
      <div class="streak-stat-value">${done}<span class="streak-stat-total"> / ${total}</span></div>
      <div class="streak-stat-label">THIS MONTH</div>
    </div>`;
}

// ── Render Calendar ────────────────────────────────────────────
const CAL_DOW    = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const CAL_MONTHS = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];

function renderCalendar(year, month) {
  const label = document.getElementById('cal-month-label');
  const grid  = document.getElementById('streak-cal-grid');
  if (!label || !grid) return;

  label.textContent = `${CAL_MONTHS[month]} ${year}`;

  const today        = new Date();
  const todayStr     = todayKey();
  const data         = loadStreakData();
  const firstDOW     = new Date(year, month, 1).getDay();
  const daysInMonth  = new Date(year, month + 1, 0).getDate();

  grid.innerHTML = '';

  // Day-of-week headers
  CAL_DOW.forEach(d => {
    const h = document.createElement('div');
    h.className   = 'cal-header';
    h.textContent = d;
    grid.appendChild(h);
  });

  // Empty cells before month start
  for (let i = 0; i < firstDOW; i++) {
    const b = document.createElement('div');
    b.className = 'cal-cell cal-blank';
    grid.appendChild(b);
  }

  // Day cells
  for (let d = 1; d <= daysInMonth; d++) {
    const m1      = String(month + 1).padStart(2, '0');
    const dd      = String(d).padStart(2, '0');
    const dateStr = `${year}-${m1}-${dd}`;
    // Compare only by date (ignore time)
    const todayNoon  = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const cellNoon   = new Date(year, month, d);
    const isFuture   = cellNoon > todayNoon;
    const isToday    = dateStr === todayStr;
    const isSelected = dateStr === streakActiveDate;
    const state      = data[dateStr];

    const cell = document.createElement('div');
    cell.className = 'cal-cell';
    if (isFuture)   cell.classList.add('cal-future');
    if (isToday)    cell.classList.add('cal-today');
    if (isSelected && !isToday) cell.classList.add('cal-selected');

    if (state?.done === true)     cell.classList.add('cal-state-done');
    else if (state !== undefined) cell.classList.add('cal-state-miss');

    cell.innerHTML = `<span class="cal-day-num">${d}</span>`;

    if (!isFuture) {
      cell.addEventListener('click', () => {
        // Mark day as visited (done: false) if not yet in data
        const fresh = loadStreakData();
        if (fresh[dateStr] === undefined) {
          fresh[dateStr] = { done: false };
          saveStreakData(fresh);
        }
        streakActiveDate = dateStr;
        renderCalendar(year, month);   // re-render to show new dot + selected state
        renderStreakStats();
        renderDayPanel(dateStr);
        // Scroll panel into view on mobile
        document.getElementById('streak-day-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }

    grid.appendChild(cell);
  }

  // Disable next-month button when already on current month
  const nextBtn = document.getElementById('cal-next');
  if (nextBtn) {
    const onCurrentMonth = year === today.getFullYear() && month === today.getMonth();
    nextBtn.disabled     = onCurrentMonth;
  }
}

// ── Render Day Panel ──────────────────────────────────────────
function renderDayPanel(dateStr) {
  const panel = document.getElementById('streak-day-panel');
  if (!panel) return;

  const parts  = dateStr.split('-').map(Number);   // [year, month1, day]
  const [year, month1, day] = parts;
  const q = getQuestionForDate(year, month1, day);

  if (!q) {
    panel.style.display = 'none';
    return;
  }

  const data   = loadStreakData();
  const isDone = data[dateStr]?.done === true;

  const dateLabel = new Date(year, month1 - 1, day).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });

  const hint    = TOPIC_HINTS[q.topic] || `Think carefully about the ${q.topic} pattern that applies here.`;
  const titleEl = q.link
    ? `<a href="${q.link}" target="_blank" rel="noopener">${escapeHtml(q.title)}</a>`
    : escapeHtml(q.title);

  panel.innerHTML = `
    <div class="streak-panel-date">${escapeHtml(dateLabel)}</div>
    <div class="streak-panel-title">${titleEl}</div>
    <div class="streak-panel-badges">
      <span class="difficulty-badge ${q.difficulty}">${q.difficulty}</span>
      <span class="topic-badge">${q.topic}</span>
    </div>
    <p class="streak-panel-hint">${escapeHtml(hint)}</p>
    <div class="streak-panel-actions">
      ${q.link
        ? `<a href="${q.link}" target="_blank" rel="noopener" class="streak-panel-link">OPEN ON LEETCODE ↗</a>`
        : `<span class="streak-panel-no-link">NO EXTERNAL LINK</span>`
      }
      <button class="streak-done-btn${isDone ? ' is-done' : ''}" id="streak-done-btn">
        ${isDone ? '✓ DEFEATED' : 'MARK DEFEATED'}
      </button>
    </div>`;

  panel.style.display = 'block';

  document.getElementById('streak-done-btn')?.addEventListener('click', () => {
    toggleStreakDone(dateStr);
  });
}

function toggleStreakDone(dateStr) {
  const data    = loadStreakData();
  const wasDone = data[dateStr]?.done === true;
  data[dateStr] = { done: !wasDone };
  saveStreakData(data);
  renderStreakStats();
  renderCalendar(streakCalYear, streakCalMonth);
  renderDayPanel(dateStr);
  showToast(wasDone ? 'QUEST RESET' : 'ENEMY DEFEATED ✓');
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
