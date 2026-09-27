import * as api from './api.js';
import { el, icon, mount, clear, levelBadge, cleanId, getParam, errorState, DOW_NAMES } from './ui.js';
import { favoriteButton } from './favorites.js';
import { savePlan, getPlan } from './api.js';
import { toast } from './ui.js';
import { track } from './analytics.js';

const root = document.getElementById('detail');
const id = cleanId(getParam('id'));

/* Load only workouts.json + routines.json directly (not api.getCatalog(), which also
 * loads exercises.json — this page never uses exercise data, so it must not fail to
 * render just because an unrelated file has a problem). */
let routines, wById, rById, r;
try {
  const [wkData, rtData] = await Promise.all([api.loadWorkouts(), api.loadRoutines()]);
  wById = new Map(wkData.workouts.map((x) => [x.id, x]));
  routines = rtData.routines;
  rById = new Map(routines.map((x) => [x.id, x]));
  r = id ? rById.get(id) : null;
} catch (err) {
  console.error('Failed to load routine data', err);
  clear(root).append(errorState({
    title: 'Could not load this routine',
    text: 'The routine data failed to load. Check your connection and try again.',
    onRetry: () => location.reload(),
  }));
  throw err;
}

if (!r) {
  clear(root).append(errorState({ title: 'Routine not found', text: "This routine doesn't exist or may have been removed.", actions: [el('a', { class: 'btn', href: 'routines.html' }, 'Browse all routines')] }));
} else {
  document.title = `${r.name} — SHINKAFIT`;
  render(r);
  track('routine_viewed', { item_id: r.id, item_type: 'routine', difficulty: r.level });
}

function render(r) {
  const active = getPlan().routineId === r.id;
  const useBtn = el('button', { class: `btn ${active ? 'btn--secondary' : ''}`, type: 'button' }, icon(active ? 'check' : 'calendar'), active ? 'Active on your planner' : 'Use this routine');
  useBtn.addEventListener('click', () => {
    savePlan({ routineId: r.id, weekly: {} });
    toast(`${r.name} set as your active routine`, { type: 'success' });
    useBtn.disabled = true; useBtn.textContent = ''; useBtn.append(icon('check'), 'Active on your planner');
  });

  const related = routines.filter((x) => x.id !== r.id && x.goal === r.goal).slice(0, 4);
  mount(root,
    el('div', { class: 'breadcrumb container' }, el('a', { href: 'routines.html' }, 'Routines'), ' / ', r.name),
    el('div', { class: 'container detail' },
      el('div', { class: 'row row--between' }, el('h1', { style: { margin: 0 } }, r.name), favoriteButton('routine', r.id, r.name)),
      el('div', { class: 'row' }, levelBadge(r.level), el('span', { class: 'tag' }, r.goal), el('span', { class: 'tag' }, `${r.weeks} weeks`)),
      el('p', { class: 'lead' }, r.description),
      el('div', { class: 'facts' }, fact('Days per week', String(r.daysPerWeek)), fact('Avg. session', `${r.minutesPerSession} min`), fact('Equipment', r.equipment.join(', '))),
      el('div', { class: 'btn-row' }, useBtn),
      el('h2', null, 'Weekly schedule'),
      el('div', { class: 'table-wrap' }, el('table', { class: 'table schedule-table' },
        el('thead', null, el('tr', null, el('th', null, 'Day'), el('th', null, 'Workout'))),
        el('tbody', null, r.schedule.map((s) => el('tr', null, el('td', null, DOW_NAMES[s.day - 1]),
          el('td', null, s.workoutId ? el('a', { href: `workout.html?id=${s.workoutId}` }, wById.get(s.workoutId)?.name || s.workoutId) : el('span', { class: 'muted' }, 'Rest day'))))))),
      notesSection('Progression', r.notes.progression), notesSection('Recovery', r.notes.recovery), notesSection('Safety', r.notes.safety)),
    related.length ? el('section', { class: 'section container' }, el('h2', null, 'More routines for this goal'),
      el('div', { class: 'card-grid' }, related.map((x) => el('a', { class: 'card', 'data-level': x.level, href: `routine.html?id=${x.id}` }, el('h3', null, x.name), el('p', null, `${x.daysPerWeek}x/week · ${x.weeks} weeks`))))) : null);
}
function fact(k, v) { return el('div', { class: 'fact' }, el('dt', null, k), el('dd', null, v)); }
function notesSection(title, items) { return el('div', null, el('h3', null, title), el('ul', { class: 'checklist' }, items.map((t) => el('li', null, icon('info'), t)))); }
