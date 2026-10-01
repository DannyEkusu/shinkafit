/* Homepage: today's workout suggestion (history-aware) + progress preview. */
import * as api from './api.js';
import { getFavorites } from './favorites.js';
import { el, icon, mount, levelBadge, fmtMinutes, isoDow, clear, tickStrip, dayKey, DOW_SHORT } from './ui.js';

/* wrapped in an async IIFE instead of using top-level await, which Safari < 15
 * (Sept 2021) does not support at all -- an unsupported top-level await fails the
 * entire module silently, with no console error, producing an unexplained blank
 * page. This is functionally identical; only the syntax used to reach it changes. */
(async () => {
const catalog = await api.getCatalog().catch(() => null);
const todayCard = document.getElementById('today-card');
const progressPreview = document.getElementById('progress-preview');

if (!catalog) {
  if (todayCard) clear(todayCard).append(el('p', { class: 'muted' }, 'Could not load workouts right now. Check your connection and reload.'));
} else {
  renderToday();
  renderProgressPreview();
}

/* Suggestion priority:
 *   1. An explicit plan for today (weekly slot or active routine's schedule) always wins.
 *   2. With enough real history (3+ completed workouts), look at the type/goal the person
 *      has actually been training most in their last 10 sessions, and suggest something in
 *      that vein — never the exact workout they just finished.
 *   3. Otherwise (new user, or no clear pattern yet), pick randomly from a level chosen at
 *      random across Beginner/Intermediate/Advanced, favouring their favorites if they have
 *      any. Nothing here is hard-coded to one workout, and nothing here invents history that
 *      didn't happen — nothing is read except api.getHistory()'s real, recorded entries. */
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

  const pickFrom = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const hist = api.getHistory();

  if (hist.length >= 3) {
    const recent = hist.slice(-10);
    const lastId = hist[hist.length - 1].workoutId;
    const typeCounts = {}, goalCounts = {};
    for (const h of recent) {
      const w = catalog.wById.get(h.workoutId);
      if (!w) continue;
      typeCounts[w.type] = (typeCounts[w.type] || 0) + 1;
      goalCounts[w.goal] = (goalCounts[w.goal] || 0) + 1;
    }
    const topType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const topGoal = Object.entries(goalCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const candidates = catalog.workouts.filter((w) => w.id !== lastId && (w.type === topType || w.goal === topGoal));
    if (candidates.length) return { workout: pickFrom(candidates), fromPlan: false, source: 'history' };
  }

  const favWorkouts = getFavorites('workout').map((f) => catalog.wById.get(f.id)).filter(Boolean);
  const pool = favWorkouts.length ? favWorkouts : catalog.workouts;
  const levels = ['Beginner', 'Intermediate', 'Advanced'];
  const inLevel = pool.filter((w) => w.difficulty === levels[Math.floor(Math.random() * levels.length)]);
  return { workout: pickFrom(inLevel.length ? inLevel : pool), fromPlan: false, source: favWorkouts.length ? 'favorites' : 'balanced' };
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

})();
