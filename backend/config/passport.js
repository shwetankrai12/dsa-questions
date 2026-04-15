// ============================================================
// Passport.js Configuration — Google OAuth Strategy
// ============================================================

const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { upsertUser } = require('./supabase');

// ── Serialize / Deserialize ──────────────────────────────────
// Stores the full user object in the session so every route
// can read req.user without an extra DB round-trip.
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// ── Google OAuth 2.0 Strategy ────────────────────────────────
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy(
    {
      clientID:     process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:  `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/auth/google/callback`,
      proxy:        true   // trust X-Forwarded-* headers when building the callback URL
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const googleId  = profile.id;
        const profileData = {
          name:   profile.displayName,
          email:  profile.emails?.[0]?.value  || '',
          avatar: profile.photos?.[0]?.value  || ''
        };

        // Try to upsert in Supabase
        const result = await upsertUser(googleId, profileData);

        if (result) {
          // Supabase configured — use the DB row as source of truth
          return done(null, {
            id:        result.user.id,   // Supabase UUID used in all DB queries
            googleId,
            name:      result.user.name,
            email:     result.user.email,
            avatar:    result.user.avatar,
            level:     result.user.level || null,
            isNewUser: result.isNew
          });
        }

        // No Supabase — session-only, always treated as new user
        return done(null, {
          id:        googleId,
          googleId,
          name:      profileData.name,
          email:     profileData.email,
          avatar:    profileData.avatar,
          level:     null,
          isNewUser: true
        });
      } catch (err) {
        console.error('Passport verify error:', err);
        return done(err);
      }
    }
  ));

  console.log('✅ Google OAuth strategy configured');
} else {
  console.warn('⚠️  Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
}

module.exports = passport;
