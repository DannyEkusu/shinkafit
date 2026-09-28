/* Authentication via Supabase Auth (GoTrue) over plain fetch: no library, no bundle.
 *
 * - Passwords are sent once, over HTTPS, to the auth provider and are never stored
 *   (not in localStorage, variables that outlive the call, JSON, or cookies).
 * - Only the short-lived access token + refresh token are kept, in localStorage
 *   (same approach as the official supabase-js client). A strict Content-Security-Policy on
 *   every page limits the XSS risk that comes with that.
 * - Only the public anon/publishable key is used here. There is no secret key in this repo. */
import { CONFIG } from './config.js';
import * as store from './storage.js';

const KEY = 'session';
export const isConfigured = () => Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
const base = () => CONFIG.SUPABASE_URL.replace(/\/+$/, '');

export class AuthError extends Error {
  constructor(message, status = 0, code = '') { super(message); this.name = 'AuthError'; this.status = status; this.code = code; }
}

const FRIENDLY = {
  invalid_credentials: 'Email or password is not correct.',
  email_not_confirmed: 'Please confirm your email first. Check your inbox for the confirmation link.',
  user_already_exists: 'An account with this email already exists. Try logging in instead.',
  weak_password: 'That password is too weak. Use at least 8 characters, mixing letters and numbers.',
  over_request_rate_limit: 'Too many attempts. Please wait a minute and try again.',
  over_email_send_rate_limit: 'Too many emails requested. Please wait a few minutes.',
  signup_disabled: 'Sign-ups are currently turned off.',
  same_password: 'Choose a password different from your current one.',
};

async function call(path, { method = 'POST', body, token } = {}) {
  if (!isConfigured()) throw new AuthError('Accounts are not set up for this site yet.', 0, 'not_configured');
  const headers = { apikey: CONFIG.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(`${base()}/auth/v1${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new AuthError('Could not reach the server. Check your connection and try again.', 0, 'network');
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const code = data?.error_code || data?.code || '';
    const msg = FRIENDLY[code] || data?.msg || data?.message || data?.error_description || 'Something went wrong. Please try again.';
    throw new AuthError(msg, res.status, String(code));
  }
  return data;
}

/* ---------- session ---------- */
function shape(d) {
  return {
    access_token: d.access_token, refresh_token: d.refresh_token,
    expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600),
    user: d.user ? { id: d.user.id, email: d.user.email, name: d.user.user_metadata?.display_name || '' } : null,
  };
}
function save(d) { const s = shape(d); store.set(KEY, s); return s; }

export function getSession(allowRecovery = false) {
  const s = store.get(KEY);
  return s && s.access_token && s.user && (allowRecovery || !s.recovery) ? s : null;
}
export const hasRecoverySession = () => Boolean(store.get(KEY)?.recovery);
export const currentUser = () => getSession()?.user || null;
export const isLoggedIn = () => Boolean(getSession());
export function onAuthChange(fn) { return store.on(KEY, fn); }

let refreshing = null;
async function refresh(s) {
  if (!refreshing) {
    refreshing = call('/token?grant_type=refresh_token', { body: { refresh_token: s.refresh_token } })
      .then((d) => save(d))
      .catch((e) => { if (e.status === 400 || e.status === 401 || e.status === 403) store.remove(KEY); throw e; })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

/* returns a valid access token, refreshing when it is about to expire; null when logged out/offline-expired */
export async function getAccessToken(allowRecovery = false) {
  let s = getSession(allowRecovery);
  if (!s) return null;
  if (s.expires_at - 60 > Date.now() / 1000) return s.access_token;
  try { s = await refresh(s); return s.access_token; } catch { return null; }
}

/* ---------- actions ---------- */
const redirectTo = (page) => new URL(`../${page}`, import.meta.url).href;

export async function signUp(email, password, displayName) {
  const data = await call(`/signup?redirect_to=${encodeURIComponent(redirectTo('login.html'))}`, {
    body: { email, password, data: { display_name: String(displayName || '').slice(0, 40) } },
  });
  if (data?.access_token) return { session: save(data), needsConfirmation: false };
  return { session: null, needsConfirmation: true };
}

export async function signIn(email, password) {
  const data = await call('/token?grant_type=password', { body: { email, password } });
  return save(data);
}

export async function signOut() {
  const s = getSession();
  try { if (s) await call('/logout', { token: s.access_token }); } catch { /* token may already be invalid */ }
  store.remove(KEY);
}

export async function requestPasswordReset(email) {
  await call(`/recover?redirect_to=${encodeURIComponent(redirectTo('login.html?mode=reset'))}`, { body: { email } });
}

/* the reset e-mail link returns to login.html#access_token=…&type=recovery */
export function consumeRecoveryHash() {
  if (!location.hash.includes('access_token')) return false;
  const p = new URLSearchParams(location.hash.slice(1));
  if (p.get('type') !== 'recovery' || !p.get('access_token')) return false;
  store.set(KEY, { access_token: p.get('access_token'), refresh_token: p.get('refresh_token') || '',
    expires_at: Math.floor(Date.now() / 1000) + Number(p.get('expires_in') || 3600), user: { id: '', email: '', name: '' }, recovery: true });
  history.replaceState(null, '', location.pathname + location.search);
  return true;
}

export async function updatePassword(newPassword) {
  const token = await getAccessToken(true);
  if (!token) throw new AuthError('Your session expired. Request a new reset link.', 401, 'no_session');
  const data = await call('/user', { method: 'PUT', token, body: { password: newPassword } });
  const s = getSession(true);
  if (s) store.set(KEY, { ...s, recovery: false, user: { id: data.id, email: data.email, name: data.user_metadata?.display_name || '' } });
}

/* permanently deletes the account and all cloud data (database function delete_my_account) */
export async function deleteAccount() {
  const token = await getAccessToken();
  if (!token) throw new AuthError('Please log in again first.', 401, 'no_session');
  const res = await fetch(`${base()}/rest/v1/rpc/delete_my_account`, {
    method: 'POST', headers: { apikey: CONFIG.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}',
  });
  if (!res.ok) throw new AuthError('Could not delete the account. Please try again.', res.status);
  store.remove(KEY);
}
