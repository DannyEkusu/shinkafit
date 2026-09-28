import * as api from './api.js';
import { mountLibrary } from './filters.js';
import { EXERCISE_SPEC } from './search.js';
import { el, icon, levelBadge, tagList } from './ui.js';
import { favoriteButton } from './favorites.js';
import { track } from './analytics.js';

const { exercises, meta } = await api.getCatalog();

function exCard(e) {
  const link = el('a', { class: 'card__link', href: `exercise.html?id=${e.id}` }, el('h3', null, e.name));
  return el('div', { class: 'card', 'data-level': e.difficulty },
    el('div', { class: 'card__top' }, link, favoriteButton('exercise', e.id, e.name)),
    el('p', null, e.description),
    el('div', { class: 'card__meta' }, levelBadge(e.difficulty), el('span', null, icon('dumbbell'), e.equipment.join(', ')), el('span', null, icon('target'), e.muscleGroups.slice(0, 2).join(', '))),
    tagList(e.tags, 3));
}

mountLibrary({
  mount: document.getElementById('library'),
  items: exercises,
  groups: [
    { key: 'difficulty', label: 'Difficulty', options: meta.difficulty, match: (e, sel) => sel.includes(e.difficulty) },
    { key: 'muscle', label: 'Muscle group', options: meta.muscleGroups, match: (e, sel) => e.muscleGroups.some((m) => sel.includes(m)) },
    { key: 'equipment', label: 'Equipment', options: meta.equipment, match: (e, sel) => e.equipment.some((eq) => sel.includes(eq)) },
    { key: 'type', label: 'Exercise type', options: meta.exerciseTypes, match: (e, sel) => sel.includes(e.type) },
    { key: 'goal', label: 'Goal', options: meta.goals, match: (e, sel) => e.goals.some((g) => sel.includes(g)) },
  ],
  spec: EXERCISE_SPEC, noun: 'exercise',
  placeholder: 'Try "push", "squat", "handstand"…',
  sorts: [
    { value: 'relevance', label: 'Most relevant' },
    { value: 'name', label: 'Name (A–Z)', cmp: (a, b) => a.name.localeCompare(b.name) },
    { value: 'difficulty', label: 'Easiest first', cmp: (a, b) => meta.difficulty.indexOf(a.difficulty) - meta.difficulty.indexOf(b.difficulty) },
  ],
  renderCard: exCard,
  onSearch: (q, n) => track('search', { source: 'exercises', result_count: n }),
});
