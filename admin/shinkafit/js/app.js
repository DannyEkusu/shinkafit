/* Boots on every page: site chrome, service worker, sync, reminders, global search. */
import { initChrome } from './navigation.js';
import * as api from './api.js';
import { isLoggedIn, onAuthChange } from './auth.js';
import { startReminderClock } from './notifications.js';
import { track, flush as flushAnalytics } from './analytics.js';
import { openModal, el, icon, debounce } from './ui.js';
import { search, EXERCISE_SPEC, WORKOUT_SPEC } from './search.js';

initChrome();
track('session_start');
startReminderClock();

if (isLoggedIn()) api.syncNow();
onAuthChange((s) => { if (s) api.onLogin(); });
window.addEventListener('online', () => { if (isLoggedIn()) api.syncNow(); });
setInterval(() => { if (isLoggedIn() && document.visibilityState === 'visible') api.syncNow(); }, 5 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAnalytics(); });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch((e) => console.warn('Service worker registration failed', e));
  });
}

/* global quick-search (header search button + Ctrl/Cmd+K) */
function openSearch() {
  const input = el('input', { class: 'input', type: 'search', placeholder: 'Search exercises and workouts…', autocomplete: 'off', 'aria-label': 'Search everything' });
  const results = el('div', { class: 'search-results' });
  const box = el('div', { class: 'stack' }, el('div', { class: 'search-box' }, icon('search'), input), results);
  const dlg = openModal({ title: 'Search SHINKAFIT', content: box, className: 'modal--search', labelledBy: 'search-title' });
  setTimeout(() => input.focus(), 30);
  const run = debounce(async () => {
    const q = input.value.trim();
    results.innerHTML = '';
    if (q.length < 2) return;
    const [{ exercises }, { workouts }] = await Promise.all([api.loadExercises(), api.loadWorkouts()]);
    const exHits = search(exercises, q, EXERCISE_SPEC).slice(0, 5);
    const wHits = search(workouts, q, WORKOUT_SPEC).slice(0, 5);
    if (!exHits.length && !wHits.length) { results.append(el('p', { class: 'muted' }, `No matches for "${q}".`)); return; }
    if (wHits.length) {
      results.append(el('p', { class: 'search-group' }, 'Workouts'));
      wHits.forEach(({ item }) => results.append(el('a', { href: `workout.html?id=${item.id}` }, item.name, el('small', null, `${item.durationMinutes} min`))));
    }
    if (exHits.length) {
      results.append(el('p', { class: 'search-group' }, 'Exercises'));
      exHits.forEach(({ item }) => results.append(el('a', { href: `exercise.html?id=${item.id}` }, item.name, el('small', null, item.difficulty))));
    }
    track('search', { source: 'global', result_count: exHits.length + wHits.length });
  }, 200);
  input.addEventListener('input', run);
}
document.querySelectorAll('[data-search-btn]').forEach((b) => b.addEventListener('click', openSearch));
document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); } });
