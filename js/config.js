/* SHINKAFIT public configuration.
 *
 * Everything in this file is PUBLIC — it ships to every visitor's browser.
 *
 * SUPABASE_URL      Your project URL:            https://YOUR-PROJECT-REF.supabase.co
 * SUPABASE_ANON_KEY Your project's "anon" (legacy) or "publishable" key.
 *
 * The anon/publishable key is designed to be public. It is safe ONLY because the
 * database has Row Level Security enabled (see backend/database-schema.sql).
 *
 * NEVER put the "service_role" key, a "secret" key, a database password, or any
 * admin credential in this file or anywhere else in this repository.
 *
 * Leave both values empty to run SHINKAFIT in local-only (guest) mode: all workout
 * features work and data stays on the device. Sign up, login and the admin
 * dashboard need these two values.
 */
export const CONFIG = Object.freeze({
  APP_NAME: 'SHINKAFIT',
  VERSION: '1.0.0',
  SUPABASE_URL: 'https://yhmtrmhndkiaytfbiacz.supabase.co/rest/v1/',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlobXRybWhuZGtpYXl0ZmJpYWN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2OTA3NTUsImV4cCI6MjEwNjI2Njc1NX0.fEdDZ01fjAOTMDL5c8j9-ndcesyUEi2HdmLG-KARIec',
  ANALYTICS_FLUSH_MS: 8000,
  MAX_HISTORY_PULL: 1000,
});
