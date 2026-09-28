/* Privacy-conscious product analytics.
 * - Anonymous by default: events are tied to a random per-device id (storage.anonId()),
 *   never to an email or account, and are batched locally before sending.
 * - No page content, search text, free-text input, or health data is ever recorded —
 *   only the name of a known, fixed event and small numeric/enum fields.
 * - Fully opt-out: disabled instantly by the "Share anonymous usage data" toggle in Settings
 *   (device().analytics) with no separate consent needed elsewhere.
 * - Requires the backend: with no Supabase configured this module is a harmless no-op. */
import { CONFIG } from './config.js';
import * as store from './storage.js';
import { isConfigured, request } from './api.js';

const ALLOWED = new Set([
  'session_start', 'workout_viewed', 'exercise_viewed', 'routine_viewed', 'search',
  'workout_started', 'workout_completed', 'exercise_completed', 'timer_used', 'favorite_added',
  'signup', 'login', 'logout', 'install_prompt_shown', 'install_accepted', 'reminder_enabled',
]);
/* only these small, non-identifying fields are ever recorded per event */
const FIELD_ALLOW = { item_id: 'string80', item_type: 'string40', difficulty: 'string20', duration_sec: 'num', result_count: 'num', source: 'string40' };

let queue = [];
let flushing = false;
let timer = null;

function enabled() { return isConfigured() && store.device().analytics !== false; }

function cleanProps(props) {
  const out = {};
  for (const [k, v] of Object.entries(props || {})) {
    const kind = FIELD_ALLOW[k]; if (!kind) continue;
    if (kind === 'num') { if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.round(v); }
    else { const s = String(v).slice(0, Number(kind.replace('string', '')) || 40); if (s) out[k] = s; }
  }
  return out;
}

export function track(event, props) {
  if (!enabled() || !ALLOWED.has(event)) return;
  queue.push({ event_name: event, anon_id: store.anonId(), props: cleanProps(props), occurred_at: new Date().toISOString(), page: (location.pathname.split('/').pop() || 'index.html') });
  clearTimeout(timer);
  timer = setTimeout(flush, CONFIG.ANALYTICS_FLUSH_MS);
  if (queue.length >= 20) flush();
}

export async function flush() {
  if (flushing || !queue.length || !enabled()) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  flushing = true;
  const batch = queue.splice(0, queue.length);
  try {
    await request('analytics_events', { method: 'POST', prefer: 'return=minimal', body: batch });
  } catch {
    if (batch.length < 200) queue = [...batch, ...queue]; /* keep trying, but never grow without bound */
  } finally { flushing = false; }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  window.addEventListener('online', flush);
}
