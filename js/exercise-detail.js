import * as api from './api.js';
import { el, icon, mount, clear, levelBadge, cleanId, getParam, errorState, announce } from './ui.js';
import { favoriteButton } from './favorites.js';
import { logExercise } from './api.js';
import { toast } from './ui.js';
import { track } from './analytics.js';

const root = document.getElementById('detail');
const id = cleanId(getParam('id'));

/* Load exercises.json directly (not api.getCatalog(), which also loads workouts.json and
 * routines.json). This page only ever needs exercise data, so it must not fail to render
 * just because an unrelated file has a problem. loadExercises() resolves to the whole
 * parsed JSON object { version, meta, exercises }, not an array. */
let exercises, exById, ex;
try {
  ({ exercises } = await api.loadExercises());
  exById = new Map(exercises.map((x) => [x.id, x]));
  ex = id ? exById.get(id) : null;
} catch (err) {
  console.error('Failed to load exercises.json', err);
  clear(root).append(errorState({
    title: 'Could not load this exercise',
    text: 'The exercise data failed to load. Check your connection and try again.',
    onRetry: () => location.reload(),
  }));
  throw err;
}

if (!ex) {
  clear(root).append(errorState({ title: 'Exercise not found', text: "This exercise doesn't exist or may have been removed.", actions: [el('a', { class: 'btn', href: 'exercises.html' }, 'Browse all exercises')] }));
} else {
  document.title = `${ex.name} — SHINKAFIT`;
  document.querySelector('meta[name="description"]')?.setAttribute('content', ex.description);
  render(ex);
  track('exercise_viewed', { item_id: ex.id, item_type: 'exercise', difficulty: ex.difficulty });
}

function related() {
  return exercises.filter((e) => e.id !== ex.id && e.muscleGroups.some((m) => ex.muscleGroups.includes(m)) && e.difficulty === ex.difficulty).slice(0, 4);
}

function render(e) {
  const media = e.media?.images?.length
    ? el('div', { class: 'media-box' }, el('img', { src: e.media.images[0].src, alt: e.media.images[0].alt || e.name, loading: 'lazy' }))
    : el('div', { class: 'media-box' }, icon('dumbbell', ''), el('p', null, 'No demonstration media yet — see the step-by-step instructions below.'));

  const factsList = el('dl', { class: 'facts' },
    fact('Difficulty', e.difficulty), fact('Equipment', e.equipment.join(', ')),
    fact('Type', e.type), fact('Muscles', e.muscleGroups.join(', ')),
    fact('Sets', String(e.sets)), fact('Reps / time', e.reps ? `${e.reps} reps${e.perSide ? ' per side' : ''}` : `${e.duration}s${e.perSide ? ' per side' : ''}`));

  const logBtn = el('button', { class: 'btn btn--secondary', type: 'button' }, icon('checkCircle'), 'Mark completed');
  logBtn.addEventListener('click', () => {
    logExercise(e.id, { sets: e.sets, reps: e.reps || 0, seconds: e.duration || 0 });
    toast(`${e.name} logged to your history`, { type: 'success' }); announce('Exercise marked completed');
    track('exercise_completed', { item_id: e.id, item_type: 'exercise' });
  });

  mount(root,
    el('div', { class: 'breadcrumb container' }, el('a', { href: 'exercises.html' }, 'Exercises'), ' / ', e.name),
    el('div', { class: 'container detail' },
      el('div', { class: 'row row--between' }, el('h1', { style: { margin: 0 } }, e.name), favoriteButton('exercise', e.id, e.name)),
      el('div', { class: 'row' }, levelBadge(e.difficulty), el('span', { class: 'tag' }, e.type), ...e.goals.map((g) => el('span', { class: 'tag' }, g))),
      el('p', { class: 'lead' }, e.description),
      el('div', { class: 'detail__cols' },
        el('div', { class: 'detail__main' },
          media,
          el('div', null, el('h2', null, 'How to do it'), el('ol', { class: 'steps' }, e.instructions.map((s) => el('li', null, s)))),
          el('div', null, el('h2', null, 'Form tips'), el('ul', { class: 'checklist' }, e.formTips.map((t) => el('li', null, icon('check'), t)))),
          el('div', null, el('h2', null, 'Common mistakes'), el('ul', { class: 'checklist checklist--warn' }, e.commonMistakes.map((t) => el('li', null, icon('info'), t))))),
        el('div', { class: 'detail__side' },
          el('div', { class: 'panel sticky-actions' }, logBtn, el('a', { class: 'btn', href: `timer.html?exercise=${e.id}` }, icon('timer'), 'Use in timer')),
          el('div', { class: 'panel' }, el('h3', null, 'Quick facts'), factsList),
          el('div', { class: 'panel' }, el('h3', null, 'Beginner modification'), el('p', { class: 'muted' }, e.beginnerModification)),
          e.progressions.length ? el('div', { class: 'panel' }, el('h3', null, 'Progressions'), el('ul', { class: 'prog-list' }, e.progressions.map((p) => el('li', null,
            icon('chevronRight'), p.exerciseId ? el('a', { href: `exercise.html?id=${p.exerciseId}` }, p.text) : p.text)))) : null))),
    related().length ? el('section', { class: 'section container' }, el('h2', null, 'Related exercises'),
      el('div', { class: 'card-grid' }, related().map((r) => el('a', { class: 'card', 'data-level': r.difficulty, href: `exercise.html?id=${r.id}` }, el('h3', null, r.name), el('p', null, r.muscleGroups.join(', ')))))) : null);
}
function fact(k, v) { return el('div', { class: 'fact' }, el('dt', null, k), el('dd', null, v)); }