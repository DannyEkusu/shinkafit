import * as api from './api.js';
import { mountLibrary } from './filters.js';
import { WORKOUT_SPEC } from './search.js';
import { el, icon, levelBadge, fmtMinutes, getParam, errorState, clear } from './ui.js';
import { favoriteButton } from './favorites.js';
import { track } from './analytics.js';

/* wrapped in an async IIFE instead of using top-level await, which Safari < 15
 * (Sept 2021) does not support at all -- an unsupported top-level await fails the
 * entire module silently, with no console error, producing an unexplained blank
 * page. This is functionally identical; only the syntax used to reach it changes. */
(async () => {
const mountEl = document.getElementById('library');

/* Load workouts.json + exercises.json directly (not api.getCatalog(), which also loads
 * routines.json — this page never uses routine data). Exercise names are joined in here
 * (not duplicated in workouts.json itself) so search can match a workout by an exercise
 * it contains, e.g. typing "push-up" surfaces every workout that includes a push-up. */
let workouts, meta;
try {
  const [exData, wkData] = await Promise.all([api.loadExercises(), api.loadWorkouts()]);
  const exById = new Map(exData.exercises.map((x) => [x.id, x]));
  workouts = wkData.workouts.map((w) => ({
    ...w,
    searchExercises: w.blocks.map((b) => exById.get(b.exerciseId)?.name).filter(Boolean).join(' '),
  }));
  meta = exData.meta;
} catch (err) {
  console.error('Failed to load workout data', err);
  clear(mountEl).append(errorState({
    title: 'Could not load the workout library',
    text: 'The workout data failed to load. Check your connection and try again — if this keeps happening, the file may be missing or blocked.',
    onRetry: () => location.reload(),
  }));
  throw err;
}

function workoutCard(w) {
  const link = el('a', { class: 'card__link', href: `workout.html?id=${w.id}` }, el('h3', null, w.name));
  return el('div', { class: 'card', 'data-level': w.difficulty },
    el('div', { class: 'card__top' }, link, favoriteButton('workout', w.id, w.name)),
    el('p', null, w.description),
    el('div', { class: 'card__meta' },
      levelBadge(w.difficulty),
      el('span', null, icon('clock'), fmtMinutes(w.durationMinutes * 60)),
      el('span', null, icon('list'), `${w.exerciseCount} exercises`)),
    el('div', { class: 'card__foot' }, el('span', { class: 'tag' }, w.type), el('span', { class: 'tag' }, w.equipment.join(', '))));
}

const groups = [
  { key: 'difficulty', label: 'Difficulty', options: meta.difficulty, match: (w, sel) => sel.includes(w.difficulty) },
  { key: 'type', label: 'Workout type', options: meta.workoutTypes, match: (w, sel) => sel.includes(w.type) },
  { key: 'equipment', label: 'Equipment', options: meta.equipment, match: (w, sel) => w.equipment.some((e) => sel.includes(e)) },
  { key: 'goal', label: 'Goal', options: meta.goals, match: (w, sel) => sel.includes(w.goal) },
  { key: 'duration', label: 'Duration', options: meta.durations, match: (w, sel) => sel.includes(w.durationBucket) },
];

/* accept ?difficulty= / ?type= / ?goal= deep links from the homepage */
for (const [param, key] of [['difficulty', 'difficulty'], ['type', 'type'], ['goal', 'goal']]) {
  const v = getParam(param);
  if (v) { const g = groups.find((x) => x.key === key); if (g && g.options.includes(v) && !new URLSearchParams(location.search).get(key)) { const p = new URLSearchParams(location.search); p.set(key, v); history.replaceState(null, '', `${location.pathname}?${p}`); } }
}

mountLibrary({
  mount: document.getElementById('library'),
  items: workouts, groups, spec: WORKOUT_SPEC, noun: 'workout',
  placeholder: 'Search workouts by name, muscle, goal…',
  sorts: [
    { value: 'relevance', label: 'Most relevant' },
    { value: 'duration-asc', label: 'Shortest first', cmp: (a, b) => a.durationMinutes - b.durationMinutes },
    { value: 'duration-desc', label: 'Longest first', cmp: (a, b) => b.durationMinutes - a.durationMinutes },
    { value: 'name', label: 'Name (A–Z)', cmp: (a, b) => a.name.localeCompare(b.name) },
    { value: 'difficulty', label: 'Easiest first', cmp: (a, b) => meta.difficulty.indexOf(a.difficulty) - meta.difficulty.indexOf(b.difficulty) },
  ],
  renderCard: workoutCard,
  onSearch: (q, n) => track('search', { source: 'workouts', result_count: n }),
});

})();
