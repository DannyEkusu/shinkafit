/* Admin dashboard bootstrap.
 * Security boundary: every number on this page comes from a SECURITY DEFINER
 * Postgres function (admin_overview, admin_daily_activity, admin_top_items,
 * admin_search_terms) that itself checks is_admin() and raises an error for
 * anyone not on the admin_users allow-list — see backend/database-schema.sql.
 * This page's login/redirect logic is a convenience, not the real gate: even
 * a logged-in non-admin who loads this page gets nothing back from the API. */
import { isConfigured, isLoggedIn, currentUser, onAuthChange, signOut } from '../../js/auth.js';
import { request } from '../../js/api.js';
import { injectIconSprite } from '../../js/navigation.js';
import { el, icon, mount, clear } from '../../js/ui.js';

injectIconSprite();

const gate = document.getElementById('gate');
const dashboard = document.getElementById('dashboard');
const logoutBtn = document.getElementById('admin-logout');

function showGate(node) { clear(gate).append(node); gate.hidden = false; dashboard.hidden = true; }

async function boot() {
  if (!isConfigured()) {
    showGate(el('div', { class: 'panel' }, icon('info'), el('h2', null, 'Backend not configured'),
      el('p', { class: 'muted' }, 'This site has no Supabase project connected yet, so there is no account data to show. Add your project URL and anon key to js/config.js first.')));
    return;
  }
  if (!isLoggedIn()) {
    showGate(el('div', { class: 'panel' }, icon('lock'), el('h2', null, 'Admin sign-in required'),
      el('p', { class: 'muted' }, 'Log in with an account that has been granted admin access.'),
      el('a', { class: 'btn btn--lg', href: `../login.html?next=${encodeURIComponent('admin/index.html')}` }, 'Log in')));
    return;
  }
  logoutBtn.hidden = false;
  try {
    await loadDashboard();
    gate.hidden = true; dashboard.hidden = false;
  } catch (err) {
    showGate(el('div', { class: 'panel' }, icon('shield'), el('h2', null, 'Access denied'),
      el('p', { class: 'muted' }, `Signed in as ${currentUser()?.email || 'this account'}, which is not on the admin allow-list.`),
      el('p', { class: 'hint' }, err.body?.message || err.message || ''),
      el('div', { class: 'btn-row', style: { justifyContent: 'center' } }, el('a', { class: 'btn btn--secondary', href: '../index.html' }, 'Back to site'))));
  }
}

logoutBtn.addEventListener('click', async () => { await signOut(); location.reload(); });
onAuthChange(boot);

/* ---------- data loading ---------- */
const rpc = (fn, body = {}) => request(`rpc/${fn}`, { method: 'POST', body });

async function loadDashboard() {
  const [overview] = await rpc('admin_overview');
  renderStatCards(overview);
  const daily = await rpc('admin_daily_activity', { days: 30 });
  renderActivityChart(daily);
  const [viewedW, completedW, viewedE, favW, favE, searches] = await Promise.all([
    rpc('admin_top_items', { item_kind: 'workout', event: 'workout_viewed', lim: 8 }),
    rpc('admin_top_items', { item_kind: 'workout', event: 'workout_completed', lim: 8 }),
    rpc('admin_top_items', { item_kind: 'exercise', event: 'exercise_viewed', lim: 8 }),
    rpc('admin_top_items', { item_kind: 'workout', event: 'favorite_added', lim: 5 }),
    rpc('admin_top_items', { item_kind: 'exercise', event: 'favorite_added', lim: 5 }),
    rpc('admin_search_terms', { lim: 10 }),
  ]);
  renderTopList('top-workouts-viewed', viewedW, 'views');
  renderTopList('top-workouts-completed', completedW, 'completions');
  renderTopList('top-exercises-viewed', viewedE, 'views');
  renderTopList('top-favorites', mergeFavorites(favW, favE), 'favorites');
  renderTopList('search-terms', searches.map((s) => ({ item_id: s.search_source, n: s.n })), 'searches', true);
}
function mergeFavorites(a, b) { return [...a, ...b].sort((x, y) => y.n - x.n).slice(0, 8); }

function statCard(label, value, iconName, hint) {
  return el('div', { class: 'stat' },
    el('div', { class: 'row', style: { justifyContent: 'space-between' } }, el('span', { class: 'stat__label' }, label), icon(iconName)),
    el('div', { class: 'stat__value' }, String(value ?? 0)),
    hint ? el('div', { class: 'stat__hint' }, hint) : null);
}
function renderStatCards(o) {
  mount(document.getElementById('stat-cards'),
    statCard('Total users', o.total_users, 'user'),
    statCard('New users (7d)', o.new_users_7d, 'user', `${o.new_users_30d} in 30 days`),
    statCard('Active devices (7d)', o.active_users_7d, 'target', `${o.active_users_30d} in 30 days`),
    statCard('Workouts completed', o.workouts_completed, 'dumbbell', `${o.workouts_completed_7d} in last 7 days`),
    statCard('Exercises completed', o.exercises_completed, 'checkCircle'),
    statCard('Total favorites', o.total_favorites, 'heart'));
}

function renderActivityChart(rows) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.new_users, r.workouts_completed, r.active_devices)));
  const wrap = el('div', { class: 'bars', style: { height: '180px' } });
  rows.forEach((r) => {
    const d = new Date(r.day);
    const col = el('div', { class: 'bars__col' },
      el('div', { style: { display: 'flex', gap: '2px', alignItems: 'flex-end', height: '140px', width: '100%', justifyContent: 'center' } },
        bar(r.new_users, max, 'var(--primary)'), bar(r.workouts_completed, max, 'var(--secondary)'), bar(r.active_devices, max, 'var(--accent)')),
      el('span', { class: 'bars__label' }, `${d.getMonth() + 1}/${d.getDate()}`));
    wrap.append(col);
  });
  mount(document.getElementById('activity-chart'), wrap);
}
function bar(v, max, color) { return el('div', { style: { width: '6px', minHeight: '2px', height: `${Math.max(2, (v / max) * 100)}%`, background: color, borderRadius: '2px 2px 0 0' }, title: String(v) }); }

function renderTopList(id, rows, unit, isSearch = false) {
  const wrap = document.getElementById(id);
  if (!rows.length) { clear(wrap).append(el('p', { class: 'muted' }, 'No data yet.')); return; }
  const max = Math.max(1, ...rows.map((r) => r.n));
  clear(wrap).append(rows.map((r) => el('div', { class: 'hbar' },
    el('span', null, isSearch ? (r.item_id || 'unknown') : r.item_id),
    el('div', { class: 'hbar__track' }, el('span', { class: 'hbar__fill', style: { width: `${(r.n / max) * 100}%` } })),
    el('span', { class: 'hbar__n' }, `${r.n}`))));
}

boot();
