// ============================================================
// Supabase Client + All Database Query Functions
// ============================================================

const { createClient } = require('@supabase/supabase-js');

let supabase = null;

function getSupabase() {
  if (supabase) return supabase;

  const url  = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.warn('⚠️  Supabase not configured — progress will not persist.');
    return null;
  }

  supabase = createClient(url, key);
  console.log('✅ Supabase client initialised');
  return supabase;
}

// ── User Queries ─────────────────────────────────────────────

/**
 * Upsert a Google-authenticated user.
 * Returns { user, isNew } where isNew is true when the user has no level set.
 */
async function upsertUser(googleId, profile) {
  const db = getSupabase();
  if (!db) return null;

  // Check for existing user
  const { data: existing, error: fetchErr } = await db
    .from('users')
    .select('*')
    .eq('google_id', googleId)
    .maybeSingle();

  if (fetchErr) throw fetchErr;

  if (existing) {
    // Returning user — refresh last_active
    await db
      .from('users')
      .update({ last_active: new Date().toISOString() })
      .eq('google_id', googleId);

    return { user: existing, isNew: !existing.level };
  }

  // New user — insert
  const { data: newUser, error: insertErr } = await db
    .from('users')
    .insert({
      google_id:  googleId,
      email:      profile.email,
      name:       profile.name,
      avatar:     profile.avatar,
      created_at: new Date().toISOString(),
      last_active: new Date().toISOString()
    })
    .select()
    .single();

  if (insertErr) throw insertErr;

  return { user: newUser, isNew: true };
}

/**
 * Persist the level a user chose and ensure a streak row exists.
 */
async function saveLevel(userId, level) {
  const db = getSupabase();
  if (!db) return null;

  const { error } = await db
    .from('users')
    .update({ level })
    .eq('id', userId);

  if (error) throw error;

  // Create streak row if it doesn't exist yet
  await db
    .from('streaks')
    .upsert(
      { user_id: userId, current_streak: 0, last_practice_date: null },
      { onConflict: 'user_id', ignoreDuplicates: true }
    );

  return { success: true };
}

// ── Progress Queries ──────────────────────────────────────────

/**
 * Returns all progress for a user as { section: { questionId: status } }.
 */
async function getProgress(userId) {
  const db = getSupabase();
  if (!db) return {};

  const { data, error } = await db
    .from('progress')
    .select('section, question_id, status')
    .eq('user_id', userId);

  if (error) throw error;

  return data.reduce((acc, row) => {
    if (!acc[row.section]) acc[row.section] = {};
    acc[row.section][row.question_id] = row.status;
    return acc;
  }, {});
}

/**
 * Returns progress for one section as { questionId: status }.
 */
async function getSectionProgress(userId, section) {
  const db = getSupabase();
  if (!db) return {};

  const { data, error } = await db
    .from('progress')
    .select('question_id, status')
    .eq('user_id', userId)
    .eq('section', section);

  if (error) throw error;

  return data.reduce((acc, row) => {
    acc[row.question_id] = row.status;
    return acc;
  }, {});
}

/**
 * Upsert a single question status. Triggers streak update when status = 'done'.
 */
async function upsertProgress(userId, section, questionId, status) {
  const db = getSupabase();
  if (!db) return null;

  const { error } = await db
    .from('progress')
    .upsert(
      {
        user_id:     userId,
        section,
        question_id: questionId,
        status,
        updated_at:  new Date().toISOString()
      },
      { onConflict: 'user_id,section,question_id' }
    );

  if (error) throw error;

  if (status === 'done') {
    await updateStreak(userId);
  }

  return { success: true };
}

// ── Streak Queries ────────────────────────────────────────────

/**
 * Return streak data for a user. Falls back to zeroed object when none exists.
 */
async function getStreak(userId) {
  const db = getSupabase();
  if (!db) return { current_streak: 0, last_practice_date: null };

  const { data, error } = await db
    .from('streaks')
    .select('current_streak, last_practice_date')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;

  return data || { current_streak: 0, last_practice_date: null };
}

/**
 * Increment or reset the streak based on last_practice_date.
 * Called automatically whenever a question is marked 'done'.
 */
async function updateStreak(userId) {
  const db = getSupabase();
  if (!db) return;

  const today     = new Date().toISOString().split('T')[0];          // YYYY-MM-DD
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0];

  const { data: streak } = await db
    .from('streaks')
    .select('current_streak, last_practice_date')
    .eq('user_id', userId)
    .maybeSingle();

  if (!streak) {
    await db.from('streaks').insert({
      user_id:            userId,
      current_streak:     1,
      last_practice_date: today
    });
    return;
  }

  // Already updated today — nothing to do
  if (streak.last_practice_date === today) return;

  const newStreak = streak.last_practice_date === yesterday
    ? streak.current_streak + 1
    : 1;

  await db
    .from('streaks')
    .update({ current_streak: newStreak, last_practice_date: today })
    .eq('user_id', userId);
}

// ── Streak Entry Queries ──────────────────────────────────────

/**
 * Returns all streak_entries for a user as { "YYYY-MM-DD": { done: bool } }.
 */
async function getStreakEntries(userId) {
  const db = getSupabase();
  if (!db) return {};

  const { data, error } = await db
    .from('streak_entries')
    .select('date, done')
    .eq('user_id', userId)
    .order('date', { ascending: true });

  if (error) throw error;

  return data.reduce((acc, row) => {
    acc[row.date] = { done: row.done };
    return acc;
  }, {});
}

/**
 * Upsert a single streak entry (mark a day done/undone).
 * date must be a 'YYYY-MM-DD' string.
 */
async function upsertStreakEntry(userId, date, done) {
  const db = getSupabase();
  if (!db) return null;

  const { error } = await db
    .from('streak_entries')
    .upsert(
      { user_id: userId, date, done },
      { onConflict: 'user_id,date' }
    );

  if (error) throw error;
  return { success: true };
}

module.exports = {
  getSupabase,
  upsertUser,
  saveLevel,
  getProgress,
  getSectionProgress,
  upsertProgress,
  getStreak,
  updateStreak,
  getStreakEntries,
  upsertStreakEntry
};
