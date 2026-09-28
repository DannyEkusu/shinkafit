/* Data access for SHINKAFIT:
 *   1. Catalogue loaders (exercises / workouts / routines JSON, cached in memory and by the service worker)
 *   2. Local-first repository for the user's own data (favourites, history, profile, preferences, plan)
 *   3. Backend REST client (Supabase PostgREST) and the sync engine
 *
 * Sync rules (so cloud data is never overwritten carelessly):
 *   - Everything is written locally first, so the app works offline.
 *   - Completed workouts / exercises carry client-generated UUIDs and are inserted with
 *     "ignore duplicates": they can only be added, never overwritten.
 *   - Favourites merge as a union; removals are explicit queued operations.
 *   - Profile / preferences / plan use last-write-wins by timestamp. Pushes are guarded
 *     (updated_at < local timestamp) so an older device cannot overwrite newer cloud data.
 *   - On login, data saved on this device as a guest is merged into the account, never dropped. */
import { CONFIG } from './config.js';
import * as store from './storage.js';
import { getAccessToken, currentUser, isConfigured, isLoggedIn, signOut } from './auth.js';

/* ============ 1. catalogue ============ */
const DATA_BASE = new URL('../data/', import.meta.url);
const jsonCache = new Map();
function loadJSON(name) {
  if (!jsonCache.has(name)) {
    jsonCache.set(name, fetch(new URL(name, DATA_BASE)).then((r) => {
      if (!r.ok) throw new Error(`Could not load ${name} (${r.status})`);
      return r.json();
    }).catch((e) => { jsonCache.delete(name); throw e; }));
  }
  return jsonCache.get(name);
}
export const loadExercises = () => loadJSON('exercises.json');
export const loadWorkouts = () => loadJSON('workouts.json');
export const loadRoutines = () => loadJSON('routines.json');
export const loadMediaSources = () => loadJSON('media-sources.json');

export async function getCatalog() {
  const [e, w, r] = await Promise.all([loadExercises(), loadWorkouts(), loadRoutines()]);
  return {
    meta: e.meta, exercises: e.exercises, workouts: w.workouts, routines: r.routines,
    exById: new Map(e.exercises.map((x) => [x.id, x])),
    wById: new Map(w.workouts.map((x) => [x.id, x])),
    rById: new Map(r.routines.map((x) => [x.id, x])),
  };
}

/* ============ 2. local repository ============ */
const nowIso = () => new Date().toISOString();
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : lo));

export const getHistory = () => store.get('history', []);
export const getExLog = () => store.get('exLog', []);

export function logWorkout({ workoutId, routineId = null, startedAt, completedAt, durationSec, exercises = [] }) {
  const rec = {
    id: store.uuid(), workoutId, routineId, startedAt, completedAt,
    durationSec: clamp(Math.round(durationSec), 0, 86400),
    exercises: exercises.map((e) => ({ id: store.uuid(), exerciseId: e.exerciseId, sets: e.sets | 0, reps: e.reps | 0, seconds: e.seconds | 0, at: completedAt })),
  };
  store.set('history', [...getHistory(), rec]);
  enqueue({ k: 'workout', id: rec.id });
  return rec;
}

export function logExercise(exerciseId, { sets = 0, reps = 0, seconds = 0 } = {}) {
  const rec = { id: store.uuid(), exerciseId, at: nowIso(), sets, reps, seconds };
  store.set('exLog', [...getExLog(), rec]);
  enqueue({ k: 'exercise', id: rec.id });
  return rec;
}

export const PROFILE_DEFAULT = { displayName: '', experience: 'beginner', goals: [], workoutTypes: [], equipment: ['No Equipment'], sessionsPerWeek: 3, updatedAt: null };
export const getProfile = () => ({ ...PROFILE_DEFAULT, ...(store.get('profile', {}) || {}) });
export function saveProfile(patch) { store.set('profile', { ...getProfile(), ...patch, updatedAt: nowIso() }); enqueue({ k: 'profile' }); }

export const PREFS_DEFAULT = { reminders: { enabled: false, time: '18:00', days: [1, 3, 5] }, completionNotify: true, updatedAt: null };
export const getPrefs = () => ({ ...PREFS_DEFAULT, ...(store.get('prefs', {}) || {}) });
export function savePrefs(patch) { store.set('prefs', { ...getPrefs(), ...patch, updatedAt: nowIso() }); enqueue({ k: 'prefs' }); }

export const PLAN_DEFAULT = { weekly: {}, routineId: null, updatedAt: null };
export const getPlan = () => ({ ...PLAN_DEFAULT, ...(store.get('plan', {}) || {}) });
export function savePlan(patch) { store.set('plan', { ...getPlan(), ...patch, updatedAt: nowIso() }); enqueue({ k: 'prefs' }); }

/* everything the user has, for export */
export function exportAll() {
  return {
    app: 'SHINKAFIT', exportedAt: nowIso(), version: CONFIG.VERSION,
    profile: getProfile(), preferences: getPrefs(), plan: getPlan(),
    favorites: store.get('favorites', []), history: getHistory(), standaloneExercises: getExLog(),
  };
}

/* ============ 3. backend client ============ */
const KEY = () => CONFIG.SUPABASE_ANON_KEY;
const rest = (p) => `${CONFIG.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/${p}`;

async function buildHeaders(extra = {}) {
  const h = { apikey: KEY(), 'Content-Type': 'application/json', ...extra };
  const token = await getAccessToken();
  if (token) h.Authorization = `Bearer ${token}`;
  else if (KEY().startsWith('eyJ')) h.Authorization = `Bearer ${KEY()}`; /* legacy anon key is itself a JWT */
  return h;
}

/* low-level request. Throws {network:true} when offline, {status} for HTTP errors */
export async function request(path, { method = 'GET', body, prefer } = {}) {
  if (!isConfigured()) { const e = new Error('Backend not configured'); e.notConfigured = true; throw e; }
  let res;
  try {
    res = await fetch(rest(path), { method, headers: await buildHeaders(prefer ? { Prefer: prefer } : {}), body: body === undefined ? undefined : JSON.stringify(body) });
  } catch { const e = new Error('Network unavailable'); e.network = true; throw e; }
  if (!res.ok) { const e = new Error(`Request failed (${res.status})`); e.status = res.status; try { e.body = await res.json(); } catch { /* ignore */ } throw e; }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/* ---------- outbox ---------- */
const getOutbox = () => store.get('outbox', []);
export const pendingCount = () => getOutbox().length;
let flushTimer = null;

export function enqueue(op) {
  if (!isConfigured() || !isLoggedIn()) return; /* guests: data merges into the account at login */
  let box = getOutbox();
  const same = (a, b) => a.k === b.k && a.id === b.id && a.type === b.type && a.item === b.item;
  if (op.k === 'fav-') box = box.filter((o) => !(o.k === 'fav+' && same({ ...o, k: 'fav-' }, op)));
  if (op.k === 'fav+') box = box.filter((o) => !(o.k === 'fav-' && same({ ...o, k: 'fav+' }, op)));
  if (op.k === 'profile' || op.k === 'prefs') box = box.filter((o) => o.k !== op.k);
  if (!box.some((o) => same(o, op))) box.push(op);
  store.set('outbox', box);
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => { flush().catch(() => {}); }, 1500);
}

const inUser = () => currentUser()?.id;

async function sendOp(op) {
  const uid = inUser();
  if (op.k === 'fav+') {
    return request('favorites?on_conflict=user_id,item_type,item_id', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal', body: { user_id: uid, item_type: op.type, item_id: op.item } });
  }
  if (op.k === 'fav-') {
    return request(`favorites?user_id=eq.${uid}&item_type=eq.${encodeURIComponent(op.type)}&item_id=eq.${encodeURIComponent(op.item)}`, { method: 'DELETE', prefer: 'return=minimal' });
  }
  if (op.k === 'workout') {
    const w = getHistory().find((x) => x.id === op.id);
    if (!w) return null;
    await request('completed_workouts?on_conflict=id', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal', body: {
      id: w.id, user_id: uid, workout_id: w.workoutId, routine_id: w.routineId || null, started_at: w.startedAt, completed_at: w.completedAt,
      duration_seconds: w.durationSec, exercises_completed: w.exercises.length } });
    if (w.exercises.length) {
      await request('completed_exercises?on_conflict=id', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal', body: w.exercises.map((e) => ({
        id: e.id, user_id: uid, completed_workout_id: w.id, exercise_id: e.exerciseId, completed_at: e.at, sets_done: e.sets, reps_done: e.reps, seconds_done: e.seconds })) });
    }
    return null;
  }
  if (op.k === 'exercise') {
    const e = getExLog().find((x) => x.id === op.id);
    if (!e) return null;
    return request('completed_exercises?on_conflict=id', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal', body: {
      id: e.id, user_id: uid, completed_workout_id: null, exercise_id: e.exerciseId, completed_at: e.at, sets_done: e.sets, reps_done: e.reps, seconds_done: e.seconds } });
  }
  if (op.k === 'profile') {
    const p = getProfile();
    const row = { display_name: p.displayName, experience: p.experience, goals: p.goals, workout_types: p.workoutTypes, equipment: p.equipment, sessions_per_week: p.sessionsPerWeek };
    await request('profiles?on_conflict=id', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal', body: { id: uid, ...row } });
    /* guarded update: only succeeds if the cloud copy is older than this edit */
    return request(`profiles?id=eq.${uid}&updated_at=lt.${encodeURIComponent(p.updatedAt || nowIso())}`, { method: 'PATCH', prefer: 'return=minimal', body: { ...row, updated_at: p.updatedAt || nowIso() } });
  }
  if (op.k === 'prefs') {
    const prefs = getPrefs(); const plan = getPlan();
    const stamp = [prefs.updatedAt, plan.updatedAt].filter(Boolean).sort().pop() || nowIso();
    await request('user_preferences?on_conflict=user_id', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal', body: { user_id: uid, prefs, plan } });
    return request(`user_preferences?user_id=eq.${uid}&updated_at=lt.${encodeURIComponent(stamp)}`, { method: 'PATCH', prefer: 'return=minimal', body: { prefs, plan, updated_at: stamp } });
  }
  return null;
}

let flushing = false;
export async function flush() {
  if (flushing || !isConfigured() || !isLoggedIn() || (typeof navigator !== 'undefined' && navigator.onLine === false)) return false;
  flushing = true; setSync('syncing');
  try {
    for (const op of [...getOutbox()]) {
      try { await sendOp(op); } catch (e) {
        if (e.network || e.status === 401) throw e;
        console.warn('Dropping op the server rejected', op, e.status); /* 4xx: retrying will not help */
      }
      store.set('outbox', getOutbox().filter((o) => JSON.stringify(o) !== JSON.stringify(op)));
    }
    setSync('idle'); return true;
  } catch (e) { setSync(e.network ? 'offline' : 'error'); return false; } finally { flushing = false; }
}

/* ---------- pull + merge ---------- */
async function fetchAll(path, page = 1000, max = 5000) {
  const out = [];
  for (let off = 0; off < max; off += page) {
    const rows = await request(`${path}${path.includes('?') ? '&' : '?'}limit=${page}&offset=${off}`);
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}
const ts = (v) => (v ? Date.parse(v) || 0 : 0);

export async function pull() {
  const uid = inUser();
  if (!uid) return;
  const box = getOutbox();

  /* profile */
  const [prof] = await request(`profiles?id=eq.${uid}&select=*`);
  const lp = store.get('profile');
  if (prof) {
    const cloud = { displayName: prof.display_name || '', experience: prof.experience, goals: prof.goals || [], workoutTypes: prof.workout_types || [], equipment: prof.equipment || ['No Equipment'], sessionsPerWeek: prof.sessions_per_week || 3, updatedAt: ts(prof.updated_at) > 0 ? prof.updated_at : null };
    if (!lp || ts(cloud.updatedAt) > ts(lp.updatedAt)) {
      if (!lp || cloud.updatedAt || !lp.updatedAt) store.set('profile', { ...PROFILE_DEFAULT, ...cloud, displayName: cloud.displayName || lp?.displayName || '' });
    } else if (ts(lp.updatedAt) > ts(cloud.updatedAt) && !box.some((o) => o.k === 'profile')) enqueue({ k: 'profile' });
  }

  /* preferences + plan */
  const [pref] = await request(`user_preferences?user_id=eq.${uid}&select=*`);
  const lprefs = getPrefs(); const lplan = getPlan();
  if (pref) {
    if (pref.prefs && ts(pref.prefs.updatedAt) > ts(lprefs.updatedAt)) store.set('prefs', { ...PREFS_DEFAULT, ...pref.prefs });
    else if (ts(lprefs.updatedAt) > ts(pref.prefs?.updatedAt)) enqueue({ k: 'prefs' });
    if (pref.plan && ts(pref.plan.updatedAt) > ts(lplan.updatedAt)) store.set('plan', { ...PLAN_DEFAULT, ...pref.plan });
    else if (ts(lplan.updatedAt) > ts(pref.plan?.updatedAt)) enqueue({ k: 'prefs' });
  } else if (lprefs.updatedAt || lplan.updatedAt) enqueue({ k: 'prefs' });

  /* favourites: union, honouring queued removals */
  const cloudFav = await fetchAll('favorites?select=item_type,item_id');
  const favs = store.get('favorites', []);
  const removed = new Set(box.filter((o) => o.k === 'fav-').map((o) => `${o.type}:${o.item}`));
  const key = (f) => `${f.t}:${f.id}`;
  const have = new Set(favs.map(key));
  const cloudKeys = new Set(cloudFav.map((f) => `${f.item_type}:${f.item_id}`));
  let changed = false;
  for (const f of cloudFav) if (!have.has(`${f.item_type}:${f.item_id}`) && !removed.has(`${f.item_type}:${f.item_id}`)) { favs.push({ t: f.item_type, id: f.item_id, at: nowIso() }); changed = true; }
  if (changed) store.set('favorites', favs);
  for (const f of favs) if (!cloudKeys.has(key(f))) enqueue({ k: 'fav+', type: f.t, item: f.id });

  /* history */
  const cw = await fetchAll(`completed_workouts?select=id,workout_id,routine_id,started_at,completed_at,duration_seconds&order=completed_at.desc`, 1000, CONFIG.MAX_HISTORY_PULL);
  const ce = await fetchAll('completed_exercises?select=id,completed_workout_id,exercise_id,completed_at,sets_done,reps_done,seconds_done&order=completed_at.desc');
  const hist = getHistory(); const hIds = new Set(hist.map((h) => h.id));
  const byWorkout = new Map();
  for (const e of ce) if (e.completed_workout_id) { if (!byWorkout.has(e.completed_workout_id)) byWorkout.set(e.completed_workout_id, []); byWorkout.get(e.completed_workout_id).push({ id: e.id, exerciseId: e.exercise_id, sets: e.sets_done || 0, reps: e.reps_done || 0, seconds: e.seconds_done || 0, at: e.completed_at }); }
  let hChanged = false;
  for (const w of cw) if (!hIds.has(w.id)) { hist.push({ id: w.id, workoutId: w.workout_id, routineId: w.routine_id, startedAt: w.started_at, completedAt: w.completed_at, durationSec: w.duration_seconds, exercises: byWorkout.get(w.id) || [] }); hChanged = true; }
  if (hChanged) store.set('history', hist.sort((a, b) => ts(a.completedAt) - ts(b.completedAt)));
  const cloudW = new Set(cw.map((w) => w.id));
  for (const h of getHistory()) if (!cloudW.has(h.id)) enqueue({ k: 'workout', id: h.id });

  const log = getExLog(); const lIds = new Set(log.map((x) => x.id)); let lChanged = false;
  for (const e of ce) if (!e.completed_workout_id && !lIds.has(e.id)) { log.push({ id: e.id, exerciseId: e.exercise_id, at: e.completed_at, sets: e.sets_done || 0, reps: e.reps_done || 0, seconds: e.seconds_done || 0 }); lChanged = true; }
  if (lChanged) store.set('exLog', log);
  const cloudE = new Set(ce.map((e) => e.id));
  for (const e of getExLog()) if (!cloudE.has(e.id)) enqueue({ k: 'exercise', id: e.id });
}

/* ---------- sync orchestration ---------- */
const syncListeners = new Set();
let syncState = 'idle';
function setSync(s) { syncState = s; syncListeners.forEach((fn) => { try { fn(s); } catch { /* ignore */ } }); }
export const onSyncState = (fn) => { syncListeners.add(fn); return () => syncListeners.delete(fn); };
export const getSyncState = () => syncState;

let syncing = false;
export async function syncNow() {
  if (syncing || !isConfigured() || !isLoggedIn() || !inUser()) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { setSync('offline'); return false; }
  syncing = true; setSync('syncing');
  try {
    await pull();
    await flush();
    store.set('lastSync', nowIso());
    setSync('idle');
    return true;
  } catch (e) { setSync(e.network ? 'offline' : 'error'); console.warn('Sync failed', e.status || e.message); return false; } finally { syncing = false; }
}

/* called right after a successful login */
export async function onLogin() {
  const uid = inUser();
  if (!uid) return;
  const owner = store.get('owner');
  if (owner && owner !== uid) store.USER_KEYS.forEach((k) => { if (k !== 'owner') store.remove(k); }); /* another person's leftovers: never merge into this account */
  store.set('owner', uid);
  await syncNow();
}

/* log out safely: try to push unsynced changes first */
export async function logout({ force = false } = {}) {
  if (pendingCount() > 0) { await flush().catch(() => {}); if (pendingCount() > 0 && !force) return { ok: false, pending: pendingCount() }; }
  await signOut();
  store.clearUserData();
  return { ok: true };
}
