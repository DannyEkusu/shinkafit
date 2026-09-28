/* Homepage: today's workout preview, progress preview, live counts, featured cards. */
import * as api from './api.js';
import { getFavorites } from './favorites.js';
import { el, icon, mount, levelBadge, fmtMinutes, isoDow, clear, skeletons, tickStrip, dayKey, DOW_SHORT } from './ui.js';

const catalog = await api.getCatalog().catch(() => null);
const featuredWrap = document.getElementById('featured-workouts');
const catTiles = document.getElementById('category-tiles');
const todayCard = document.getElementById('today-card');
const progressPreview = document.getElementById('progress-preview');

if (!catalog) {
  if (featuredWrap) clear(featuredWrap).append(el('p', { class: 'muted' }, 'Could not load workouts right now. Check your connection and reload.'));
} else {
  renderFeatured();
  renderCategories();
  renderToday();
  renderProgressPreview();
}

function workoutCard(w) {
  return el('a', { class: 'card', 'data-level': w.difficulty, href: `workout.html?id=${w.id}` },
    el('div', { class: 'card__top' }, el('h3', null, w.name), levelBadge(w.difficulty)),
    el('p', null, w.description),
    el('div', { class: 'card__meta' },
      el('span', null, icon('clock'), fmtMinutes(w.durationMinutes * 60)),
      el('span', null, icon('list'), `${w.exerciseCount} exercises`),
      el('span', null, icon('target'), w.goal)));
}

function renderFeatured() {
  if (!featuredWrap) return;
  const list = catalog.workouts.filter((w) => w.featured).slice(0, 6);
  clear(featuredWrap).append(list.map(workoutCard));
}

function renderCategories() {
  if (!catTiles) return;
  const types = [...new Set(catalog.workouts.map((w) => w.type))];
  clear(catTiles).append(types.map((t) => el('a', { class: 'tile', href: `workouts.html?type=${encodeURIComponent(t)}` },
    t, el('small', null, catalog.workouts.filter((w) => w.type === t).length))));
}

function pickTodayWorkout() {
  const plan = api.getPlan();
  const dow = isoDow();
  const planned = plan.weekly?.[dow];
  if (planned && catalog.wById.has(planned)) return { workout: catalog.wById.get(planned), fromPlan: true };
  if (plan.routineId && catalog.rById.has(plan.routineId)) {
    const r = catalog.rById.get(plan.routineId);
    const sched = r.schedule.find((s) => s.day === dow && s.workoutId);
    if (sched) return { workout: catalog.wById.get(sched.workoutId), fromPlan: true };
  }
  const favWorkouts = getFavorites('workout').map((f) => catalog.wById.get(f.id)).filter(Boolean);
  if (favWorkouts.length) return { workout: favWorkouts[dow % favWorkouts.length], fromPlan: false };
  const featured = catalog.workouts.filter((w) => w.featured);
  return { workout: featured[dow % featured.length] || catalog.workouts[0], fromPlan: false };
}

function renderToday() {
  if (!todayCard) return;
  const { workout, fromPlan } = pickTodayWorkout();
  const mainBlocks = workout.blocks.filter((b) => b.phase === 'main').slice(0, 5);
  mount(todayCard,
    el('div', { class: 'today__head' }, el('span', { class: 'today__label muted' }, fromPlan ? "Today's planned workout" : 'Suggested for today'), el('span', { class: 'badge', dataset: { level: workout.difficulty } }, workout.difficulty)),
    el('h2', null, workout.name),
    el('p', { class: 'today__note' }, `${workout.durationMinutes} min · ${workout.exerciseCount} exercises · ${workout.equipment.join(', ')}`),
    el('ul', { class: 'today__list' }, mainBlocks.map((b) => { const ex = catalog.exById.get(b.exerciseId);
      return el('li', null, el('span', null, ex ? ex.name : b.exerciseId), el('span', null, b.reps ? `${b.sets}×${b.reps}` : `${b.sets}×${b.seconds}s`)); })),
    el('div', { class: 'btn-row' },
      el('a', { class: 'btn btn--lg', href: `timer.html?workout=${workout.id}` }, icon('play'), 'Start workout'),
      el('a', { class: 'btn btn--secondary', href: `workout.html?id=${workout.id}` }, 'View details')));
}

function renderProgressPreview() {
  if (!progressPreview) return;
  const hist = api.getHistory();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = dayKey(d);
    days.push({ label: DOW_SHORT[isoDow(d) - 1], full: d.toDateString(), today: i === 0, done: hist.some((h) => dayKey(new Date(h.completedAt)) === key) });
  }
  let streak = 0;
  for (let i = 0; ; i++) { const d = new Date(); d.setDate(d.getDate() - i); if (hist.some((h) => dayKey(new Date(h.completedAt)) === dayKey(d))) streak++; else break; }
  mount(progressPreview,
    el('div', { class: 'row row--between' }, el('h3', null, 'Last 7 days'), el('span', { class: 'badge badge--success' }, icon('flame'), `${streak} day streak`)),
    tickStrip(days),
    el('p', { class: 'muted', style: { marginTop: '0.75rem', marginBottom: 0 } }, `${hist.length} workout${hist.length === 1 ? '' : 's'} completed all-time.`),
    el('a', { class: 'btn btn--secondary btn--sm', href: 'progress.html', style: { marginTop: '0.75rem' } }, 'View full progress'));
}
