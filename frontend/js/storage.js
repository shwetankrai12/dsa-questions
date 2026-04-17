/* ============================================================
   Storage — Supabase-backed persistence for DSA Sheet
   Exposes a global `Storage` object. Load before app.js.
   ============================================================ */

(function (global) {
  'use strict';

  // ─── Config ────────────────────────────────────────────────
  const API_BASE = window.location.hostname === 'localhost'
    ? 'http://localhost:3001/api'
    : '/api';

  // ─── In-memory caches ──────────────────────────────────────
  let _progress = null;   // { section: { questionId: status } }
  let _streaks  = null;   // { "YYYY-MM-DD": { done: bool } }
  let _unlocks  = null;   // { beginner: bool, intermediate: bool, advanced: bool }

  // ─── Retry queue for writes that fail offline ───────────────
  let _retryQueue = [];
  let _retryTimer = null;
  let _offlineToastShown = false;

  function _flushQueue() {
    if (!_retryQueue.length) { _retryTimer = null; return; }
    const next = _retryQueue.shift();
    next().catch(() => {
      _retryQueue.unshift(next);   // put it back
    }).finally(() => {
      _retryTimer = setTimeout(_flushQueue, 5000);
    });
  }

  function _enqueueWrite(fn) {
    _retryQueue.push(fn);
    if (!_retryTimer) _retryTimer = setTimeout(_flushQueue, 0);
  }

  // ─── Auth helper ────────────────────────────────────────────
  function _authFetch(url, options = {}) {
    const token = localStorage.getItem('dsa_token');
    return fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });
  }

  function _showOfflineToast() {
    if (_offlineToastShown) return;
    _offlineToastShown = true;
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = 'CONNECTION LOST — retrying...';
    toast.classList.add('show');
    setTimeout(() => { toast.classList.remove('show'); _offlineToastShown = false; }, 4000);
  }

  // ─── Migration ─────────────────────────────────────────────
  const MIGRATION_KEY = 'dsa_migrated_v1';

  async function migrateFromLocalIfNeeded() {
    if (localStorage.getItem(MIGRATION_KEY)) return;
    const token = localStorage.getItem('dsa_token');
    if (!token) return;   // not logged in yet

    const rawProgress = localStorage.getItem('dsa_progress');
    const rawStreak   = localStorage.getItem('dsa_streak_data');

    const progress      = rawProgress ? JSON.parse(rawProgress) : {};
    const streakEntries = rawStreak   ? JSON.parse(rawStreak)   : {};

    const hasData = Object.keys(progress).length > 0 || Object.keys(streakEntries).length > 0;
    if (!hasData) {
      localStorage.setItem(MIGRATION_KEY, '1');
      return;
    }

    try {
      const res = await _authFetch(`${API_BASE}/migrate-from-local`, {
        method: 'POST',
        body:   JSON.stringify({ progress, streakEntries })
      });

      if (res.ok) {
        localStorage.setItem(MIGRATION_KEY, '1');
        // Keep localStorage as fallback — don't delete it
        console.log('[Storage] Local data migrated to Supabase.');
      }
    } catch (_) {
      // Network error — will retry next session
    }
  }

  // ─── Progress ──────────────────────────────────────────────

  async function getProgress() {
    if (_progress !== null) return _progress;

    // Try Supabase first
    try {
      const res = await _authFetch(`${API_BASE}/progress`);
      if (res.ok) {
        _progress = await res.json();
        return _progress;
      }
    } catch (_) {}

    // Fallback: localStorage
    const stored = localStorage.getItem('dsa_progress');
    _progress = stored ? JSON.parse(stored) : {};
    return _progress;
  }

  function cachedProgress() {
    if (_progress !== null) return _progress;
    const stored = localStorage.getItem('dsa_progress');
    _progress = stored ? JSON.parse(stored) : {};
    return _progress;
  }

  function setQuestionStatus(section, questionId, status) {
    // Optimistic: update cache immediately
    if (!_progress) _progress = {};
    if (!_progress[section]) _progress[section] = {};
    _progress[section][questionId] = status;

    // Mirror to localStorage as backup
    localStorage.setItem('dsa_progress', JSON.stringify(_progress));

    // Push to backend with retry
    const write = () => _authFetch(`${API_BASE}/progress`, {
      method: 'POST',
      body:   JSON.stringify({ section, questionId, status })
    }).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    }).catch(err => {
      _showOfflineToast();
      throw err;
    });

    _enqueueWrite(write);
  }

  // ─── Streak Entries ────────────────────────────────────────

  async function getStreakEntries() {
    if (_streaks !== null) return _streaks;

    try {
      const res = await _authFetch(`${API_BASE}/streak/entries`);
      if (res.ok) {
        const remote = await res.json();
        // Merge with any local data (local may have offline writes)
        const local = _getLocalStreaks();
        _streaks = Object.assign({}, local, remote);
        return _streaks;
      }
    } catch (_) {}

    _streaks = _getLocalStreaks();
    return _streaks;
  }

  function cachedStreakEntries() {
    if (_streaks !== null) return _streaks;
    _streaks = _getLocalStreaks();
    return _streaks;
  }

  function _getLocalStreaks() {
    try { return JSON.parse(localStorage.getItem('dsa_streak_data') || '{}'); } catch (_) { return {}; }
  }

  function setStreakEntry(date, done) {
    // Optimistic
    if (!_streaks) _streaks = _getLocalStreaks();
    _streaks[date] = { done };

    // Mirror to localStorage
    localStorage.setItem('dsa_streak_data', JSON.stringify(_streaks));

    // Push to backend with retry
    const write = () => _authFetch(`${API_BASE}/streak/entries`, {
      method: 'POST',
      body:   JSON.stringify({ date, done })
    }).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    }).catch(err => {
      _showOfflineToast();
      throw err;
    });

    _enqueueWrite(write);
  }

  // ─── Unlocks ───────────────────────────────────────────────

  async function getUnlocks() {
    if (_unlocks !== null) return _unlocks;

    try {
      const res = await _authFetch(`${API_BASE}/unlocks`);
      if (res.ok) {
        _unlocks = await res.json();
        return _unlocks;
      }
    } catch (_) {}

    _unlocks = { beginner: false, intermediate: false, advanced: false };
    return _unlocks;
  }

  function markUnlockShown(level) {
    if (!_unlocks) _unlocks = { beginner: false, intermediate: false, advanced: false };
    _unlocks[level] = true;

    _authFetch(`${API_BASE}/unlocks`, {
      method: 'PUT',
      body:   JSON.stringify({ level })
    }).catch(() => {});
  }

  // ─── Cache Control ─────────────────────────────────────────

  function clearCache() {
    _progress = null;
    _streaks  = null;
    _unlocks  = null;
    _retryQueue = [];
    if (_retryTimer) { clearTimeout(_retryTimer); _retryTimer = null; }
  }

  // ─── Public API ────────────────────────────────────────────
  global.AppStorage = {
    // Progress
    getProgress,
    cachedProgress,
    setQuestionStatus,
    // Streak
    getStreakEntries,
    cachedStreakEntries,
    setStreakEntry,
    // Unlocks
    getUnlocks,
    markUnlockShown,
    // Lifecycle
    migrateFromLocalIfNeeded,
    clearCache
  };

})(window);
