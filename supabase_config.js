// Supabase Configuration
// During the shared-instance cutover, inject:
//   window.__SHARED_SUPABASE_CONFIG__ = { url: 'https://your-shared-project.supabase.co', anonKey: '...' }
// before this file loads, or replace the legacy fallback values below once the
// shared project has been provisioned.
const sharedSupabaseConfig =
    typeof window !== 'undefined' && window.__SHARED_SUPABASE_CONFIG__
        ? window.__SHARED_SUPABASE_CONFIG__
        : null;

const LEGACY_SUPABASE_URL = 'https://bzqbhtrurzzavhqbgqrs.supabase.co';
const LEGACY_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6cWJodHJ1cnp6YXZocWJncXJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxOTc1NDMsImV4cCI6MjA3NDc3MzU0M30.xDHsAxOlv0uprE9epz-M_Emn6q3mRegtTpFt0sl9uBo';

const SUPABASE_URL = sharedSupabaseConfig?.url || LEGACY_SUPABASE_URL;
const SUPABASE_ANON_KEY = sharedSupabaseConfig?.anonKey || LEGACY_SUPABASE_ANON_KEY;

// Export for use in other files if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SUPABASE_URL, SUPABASE_ANON_KEY };
}
