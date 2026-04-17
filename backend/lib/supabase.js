// ============================================================
// Supabase client — SERVICE ROLE key, bypasses RLS.
// Never expose this module or its key to the browser.
// ============================================================

const { createClient } = require('@supabase/supabase-js');

const url        = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    'Missing Supabase config. Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. ' +
    'Get the service_role key from Supabase Dashboard → Project Settings → API.'
  );
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

console.log('[supabase] connected with service_role key');

module.exports = supabase;
