import * as api from './api.js';
import { mountLibrary } from './filters.js';
import { ROUTINE_SPEC } from './search.js';
import { el, icon, levelBadge } from './ui.js';
import { favoriteButton } from './favorites.js';
import { track } from './analytics.js';

const { routines, meta } = await api.getCatalog();

function card(r) {
  const link = el('a', { class: 'card__link', href: `routine.html?id=${r.id}` }, el('h3', null, r.name));
  return el('div', { class: 'card', 'data-level': r.level },
    el('div', { class: 'card__top' }, link, favoriteButton('routine', r.id, r.name)),
    el('p', null, r.description),
    el('div', { class: 'card__meta' }, levelBadge(r.level), el('span', null, icon('calendar'), `${r.daysPerWeek}x/week`), el('span', null, icon('clock'), `${r.minutesPerSession} min`)),
    el('div', { class: 'card__foot' }, el('span', { class: 'tag' }, r.goal), el('span', { class: 'tag' }, `${r.weeks} weeks`)));
}

mountLibrary({
  mount: document.getElementById('library'),
  items: routines,
  groups: [
    { key: 'level', label: 'Level', options: meta.difficulty, match: (r, sel) => sel.includes(r.level) },
    { key: 'goal', label: 'Goal', options: meta.goals, match: (r, sel) => sel.includes(r.goal) },
    { key: 'equipment', label: 'Equipment', options: meta.equipment, match: (r, sel) => r.equipment.some((e) => sel.includes(e)) },
    { key: 'time', label: 'Time per session', options: ['Up to 20 min', '20-40 min', '40+ min'], match: (r, sel) => sel.includes(r.timeBucket) },
  ],
  spec: ROUTINE_SPEC, noun: 'routine', placeholder: 'Search routines by goal or level…',
  sorts: [
    { value: 'relevance', label: 'Most relevant' },
    { value: 'name', label: 'Name (A–Z)', cmp: (a, b) => a.name.localeCompare(b.name) },
    { value: 'days', label: 'Fewest days/week', cmp: (a, b) => a.daysPerWeek - b.daysPerWeek },
  ],
  renderCard: card,
  onSearch: (q, n) => track('search', { source: 'routines', result_count: n }),
});
