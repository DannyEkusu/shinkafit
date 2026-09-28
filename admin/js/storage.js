/* Safe localStorage wrapper with in-memory fallback, change events and helpers.
 * Never store passwords here. The auth session (tokens only) lives under "session". */
const NS = 'sf:';
const mem = new Map();
const listeners = new Map();
let usable = null;

function canUse() {
  if (usable !== null) return usable;
  try {
    const k = NS + '__probe';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    usable = true;
  } catch { usable = false; }
  return usable;
}

function emit(key, value) {
  (listeners.get(key) || []).forEach((fn) => { try { fn(value); } catch (e) { console.error(e); } });
  (listeners.get('*') || []).forEach((fn) => { try { fn(key, value); } catch (e) { console.error(e); } });
}

export function on(key, fn) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(fn);
  return () => listeners.get(key)?.delete(fn);
}

export function get(key, fallback = null) {
  try {
    const raw = canUse() ? localStorage.getItem(NS + key) : mem.get(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch { return fallback; }
}

export function set(key, value) {
  const raw = JSON.stringify(value);
  try {
    if (canUse()) localStorage.setItem(NS + key, raw); else mem.set(key, raw);
  } catch { mem.set(key, raw); emit(key, value); return false; }
  emit(key, value);
  return true;
}

export function remove(key) {
  try { if (canUse()) localStorage.removeItem(NS + key); } catch { /* ignore */ }
  mem.delete(key);
  emit(key, null);
}

/* Keys holding one person's data. They are wiped on logout so the next person
 * using this browser never sees them. Device settings ("device") are kept. */
export const USER_KEYS = ['favorites', 'history', 'exLog', 'profile', 'prefs', 'plan', 'outbox', 'lastSync', 'active', 'owner'];
export function clearUserData() { USER_KEYS.forEach(remove); }

/* keep several tabs in step */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (!e.key || !e.key.startsWith(NS)) return;
    const key = e.key.slice(NS.length);
    let val = null;
    try { val = e.newValue == null ? null : JSON.parse(e.newValue); } catch { /* ignore */ }
    emit(key, val);
  });
}

export function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0'));
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10).join('')}`;
}

/* random per-device id used only for anonymous product analytics (never linked to an account) */
export function anonId() {
  let id = get('anon');
  if (!id) { id = uuid(); set('anon', id); }
  return id;
}

/* device-level settings: never synced, never cleared on logout */
const DEVICE_DEFAULTS = { theme: 'system', motion: 'system', sound: true, vibrate: true, lowData: false, analytics: true };
export function device() { return { ...DEVICE_DEFAULTS, ...(get('device', {}) || {}) }; }
export function setDevice(patch) { const next = { ...device(), ...patch }; set('device', next); return next; }
