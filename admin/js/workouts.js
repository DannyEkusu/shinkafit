import * as api from './api.js';
import { mountLibrary } from './filters.js';
import { WORKOUT_SPEC } from './search.js';
import { el, icon, levelBadge, fmtMinutes, getParam } from './ui.js';
import { favoriteButton } from './favorites.js';
import { track } from './analytics.js';

const { workouts, meta } = await api.getCatalog();

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
