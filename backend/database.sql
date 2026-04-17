-- ============================================================
-- DSA Sheet by Shwetank — Supabase Schema
-- Run this in the Supabase SQL editor (Database → SQL editor)
-- ============================================================

-- ── users ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_id      TEXT UNIQUE NOT NULL,
  email          TEXT,
  name           TEXT,
  avatar         TEXT,
  level          TEXT CHECK (level IN ('beginner', 'intermediate', 'advanced')),
  unlocks_shown  TEXT[] NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migration: add unlocks_shown to existing tables
ALTER TABLE users ADD COLUMN IF NOT EXISTS unlocks_shown TEXT[] NOT NULL DEFAULT '{}';

-- ── progress ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS progress (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section      TEXT NOT NULL,   -- dsa | interview | system_design | oops
  question_id  TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'todo'
                   CHECK (status IN ('todo', 'progress', 'done')),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, section, question_id)
);

CREATE INDEX IF NOT EXISTS progress_user_section_idx
  ON progress (user_id, section);

-- ── streaks ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS streaks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  current_streak      INTEGER NOT NULL DEFAULT 0,
  last_practice_date  DATE
);

-- ── streak_entries ───────────────────────────────────────────
-- One row per (user, date) — tracks the Training Grid calendar.
-- Separate from the `streaks` table which stores the aggregated count.
CREATE TABLE IF NOT EXISTS streak_entries (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date     DATE NOT NULL,
  done     BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS streak_entries_user_idx
  ON streak_entries (user_id, date DESC);

-- ── Row Level Security ────────────────────────────────────────
-- Enable RLS so users can only see their own data.

ALTER TABLE users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress       ENABLE ROW LEVEL SECURITY;
ALTER TABLE streaks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE streak_entries ENABLE ROW LEVEL SECURITY;

-- The backend uses the service-role key (or anon key with auth.uid()).
-- If you use the anon key, add policies like the ones below.
-- If you use the service-role key, RLS is bypassed automatically.

-- Example policies (uncomment if using anon key from server):
--
-- CREATE POLICY "users: own row"    ON users    FOR ALL USING (id = auth.uid());
-- CREATE POLICY "progress: own rows" ON progress FOR ALL USING (user_id = auth.uid());
-- CREATE POLICY "streaks: own row"  ON streaks  FOR ALL USING (user_id = auth.uid());
