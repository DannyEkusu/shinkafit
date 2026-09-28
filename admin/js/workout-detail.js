import * as api from './api.js';
import { el, icon, mount, clear, levelBadge, cleanId, getParam, errorState, fmtMinutes } from './ui.js';
import { favoriteButton } from './favorites.js';
import { track } from './analytics.js';

const root = document.getElementById('detail');
const id = cleanId(getParam('id'));
const { workouts, exById, wById } = await api.getCatalog();
const w = id ? wById.get(id) : null;

if (!w) {
  clear(root).append(errorState({ title: 'Workout not found', text: "This workout doesn't exist or may have been removed.", actions: [el('a', { class: 'btn', href: 'workouts.html' }, 'Browse all workouts')] }));
} else {
  document.title = `${w.name} — SHINKAFIT`;
  document.querySelector('meta[name="description"]')?.setAttribute('content', w.description);
  render(w);
  track('workout_viewed', { item_id: w.id, item_type: 'workout', difficulty: w.difficulty });
}

const PHASE_LABEL = { warmup: 'Warm-up', main: 'Main workout', cooldown: 'Cool-down' };

function blockRow(b) {
  const ex = exById.get(b.exerciseId);
  const rx = b.reps ? `${b.sets} × ${b.reps}${b.perSide ? ' /side' : ''}` : `${b.sets} × ${b.seconds}s${b.perSide ? ' /side' : ''}`;
  return el('li', { class: 'block' },
    el('div', null, el('a', { href: `exercise.html?id=${b.exerciseId}` }, ex ? ex.name : b.exerciseId), b.note ? el('small', null, b.note) : null),
    el('div', { class: 'block__rx' }, rx, el('small', null, `rest ${b.rest}s`)));
}

function render(w) {
  const phases = ['warmup', 'main', 'cooldown'].map((ph) => ({ ph, blocks: w.blocks.filter((b) => b.phase === ph) })).filter((x) => x.blocks.length);
  const fmtLabel = w.format === 'circuit' ? `Circuit × ${w.rounds} rounds (${w.restBetweenRounds}s rest between rounds)` : 'Straight sets';
  const related = workouts.filter((x) => x.id !== w.id && x.type === w.type).slice(0, 4);

  mount(root,
    el('div', { class: 'breadcrumb container' }, el('a', { href: 'workouts.html' }, 'Workouts'), ' / ', w.name),
    el('div', { class: 'container detail' },
      el('div', { class: 'row row--between' }, el('h1', { style: { margin: 0 } }, w.name), favoriteButton('workout', w.id, w.name)),
      el('div', { class: 'row' }, levelBadge(w.difficulty), el('span', { class: 'tag' }, w.type), el('span', { class: 'tag' }, w.goal)),
      el('p', { class: 'lead' }, w.description),
      el('div', { class: 'facts' },
        fact('Duration', fmtMinutes(w.durationMinutes * 60)), fact('Exercises', String(w.exerciseCount)),
        fact('Equipment', w.equipment.join(', ')), fact('Format', fmtLabel)),
      el('div', { class: 'btn-row' },
        el('a', { class: 'btn btn--lg', href: `timer.html?workout=${w.id}` }, icon('play'), 'Start this workout'),
        el('button', { class: 'btn btn--secondary', type: 'button', onClick: sharePage }, icon('share'), 'Share')),
      phases.map(({ ph, blocks }) => el('div', null, el('p', { class: 'phase-title' }, PHASE_LABEL[ph]), el('ul', { class: 'block-list' }, blocks.map(blockRow))))),
    related.length ? el('section', { class: 'section container' }, el('h2', null, `More ${w.type} workouts`),
      el('div', { class: 'card-grid' }, related.map((r) => el('a', { class: 'card', 'data-level': r.difficulty, href: `workout.html?id=${r.id}` }, el('h3', null, r.name), el('p', null, `${r.durationMinutes} min`))))) : null);
}
function fact(k, v) { return el('div', { class: 'fact' }, el('dt', null, k), el('dd', null, v)); }
async function sharePage() {
  const data = { title: `${w.name} — SHINKAFIT`, text: w.description, url: location.href };
  if (navigator.share) { try { await navigator.share(data); } catch { /* cancelled */ } }
  else { await navigator.clipboard.writeText(location.href); const { toast } = await import('./ui.js'); toast('Link copied to clipboard'); }
}
