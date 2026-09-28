import * as api from './api.js';
import { getFavorites } from './favorites.js';
import { el, icon, mount, clear, fmtMinutes, dayKey, isoDow, DOW_SHORT, DOW_NAMES, tickStrip, ring, plural, fmtDate, download } from './ui.js';

const { exById, wById } = await api.getCatalog();
const hist = [...api.getHistory()].sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
const exLog = api.getExLog();

renderHeadline();
renderStreakRing();
renderWeekBars();
renderMilestones();
renderFavorites();
renderHistory();
wireExport();

function computeStreak() {
  let streak = 0;
  for (let i = 0; ; i++) { const d = new Date(); d.setDate(d.getDate() - i); if (hist.some((h) => dayKey(new Date(h.completedAt)) === dayKey(d))) streak++; else break; }
  let best = 0; let cur = 0; const days = new Set(hist.map((h) => dayKey(new Date(h.completedAt))));
  const sorted = [...days].sort();
  for (let i = 0; i < sorted.length; i++) { if (i > 0) { const prev = new Date(sorted[i - 1]); const d = new Date(sorted[i]); cur = (d - prev) / 86400000 === 1 ? cur + 1 : 1; } else cur = 1; best = Math.max(best, cur); }
  return { streak, best };
}

function renderHeadline() {
  const totalSec = hist.reduce((s, h) => s + h.durationSec, 0) + exLog.reduce((s, e) => s + (e.seconds || 0), 0);
  const stats = [
    ['Workouts completed', hist.length, 'dumbbell'],
    ['Total time trained', fmtMinutes(totalSec), 'clock'],
    ['Exercises logged', hist.reduce((s, h) => s + h.exercises.length, 0) + exLog.length, 'list'],
    ['Favorites saved', getFavorites().length, 'heart'],
  ];
  mount(document.getElementById('stat-tiles'), stats.map(([label, value, ic]) => el('div', { class: 'stat' },
    el('div', { class: 'row', style: { justifyContent: 'space-between' } }, el('span', { class: 'stat__label' }, label), icon(ic)), el('div', { class: 'stat__value' }, String(value)))));
}

function renderStreakRing() {
  const { streak, best } = computeStreak();
  const target = Math.max(7, best, streak);
  const r = ring({ size: 200, stroke: 14, pct: 0 });
  r.set(target ? streak / target : 0);
  mount(r.label, el('div', { class: 'stat__value', style: { fontSize: '2.4rem' } }, String(streak)), el('div', { class: 'stat__label' }, plural(streak, 'day streak', 'day streak')));
  mount(document.getElementById('streak-ring'), r.el, el('p', { class: 'muted text-center' }, `Best streak so far: ${best} ${best === 1 ? 'day' : 'days'}`));
}

function renderWeekBars() {
  const days = []; let max = 1;
  for (let i = 27; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const key = dayKey(d); const mins = Math.round(hist.filter((h) => dayKey(new Date(h.completedAt)) === key).reduce((s, h) => s + h.durationSec, 0) / 60); max = Math.max(max, mins); days.push({ d, mins }); }
  const weeks = []; for (let i = 0; i < 4; i++) weeks.push(days.slice(i * 7, i * 7 + 7));
  const bars = el('div', { class: 'bars' }, days.slice(-7).map(({ d, mins }) => el('div', { class: 'bars__col' },
    el('span', { class: 'bars__val' }, mins || ''), el('div', { class: `bars__bar${mins ? '' : ' bars__bar--zero'}`, style: { height: `${Math.max(3, (mins / max) * 100)}%` } }), el('span', { class: 'bars__label' }, DOW_SHORT[isoDow(d) - 1]))));
  mount(document.getElementById('week-bars'), bars);

  const today = new Date(); const strip = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); strip.push({ label: DOW_SHORT[isoDow(d) - 1], full: d.toDateString(), today: i === 0, done: hist.some((h) => dayKey(new Date(h.completedAt)) === dayKey(d)) }); }
  mount(document.getElementById('tick-strip'), tickStrip(strip));
}

const MILESTONES = [
  { n: 1, label: 'First workout', icon: 'checkCircle' }, { n: 5, label: '5 workouts', icon: 'target' },
  { n: 10, label: '10 workouts', icon: 'target' }, { n: 25, label: '25 workouts', icon: 'trophy' },
  { n: 50, label: '50 workouts', icon: 'trophy' }, { n: 100, label: '100 workouts', icon: 'trophy' },
];
function renderMilestones() {
  mount(document.getElementById('milestones'), MILESTONES.map((m) => el('div', { class: `milestone${hist.length >= m.n ? ' is-done' : ''}` },
    icon(hist.length >= m.n ? 'checkCircle' : m.icon), el('div', null, el('strong', null, m.label), el('small', null, hist.length >= m.n ? 'Completed' : `${m.n - hist.length} to go`)))));
}

function renderFavorites() {
  const favs = getFavorites();
  const wrap = document.getElementById('fav-list');
  if (!favs.length) { clear(wrap).append(el('p', { class: 'muted' }, "You haven't favorited anything yet. Tap the heart on a workout or exercise to save it here.")); return; }
  clear(wrap).append(el('div', { class: 'card-grid' }, favs.slice(0, 12).map((f) => {
    const item = f.t === 'workout' ? wById.get(f.id) : f.t === 'exercise' ? exById.get(f.id) : null;
    const name = item ? item.name : f.id;
    const href = f.t === 'workout' ? `workout.html?id=${f.id}` : f.t === 'exercise' ? `exercise.html?id=${f.id}` : `routine.html?id=${f.id}`;
    return el('a', { class: 'card card--flat', href }, el('h3', null, name), el('p', null, f.t));
  })));
}

function renderHistory() {
  const wrap = document.getElementById('history-list');
  if (!hist.length) { clear(wrap).append(el('p', { class: 'muted' }, 'No completed workouts yet. Start one from the workout library to see it here.')); return; }
  clear(wrap).append(hist.slice(0, 20).map((h) => {
    const w = wById.get(h.workoutId);
    return el('div', { class: 'history-item' }, el('div', null, el('strong', null, w ? w.name : h.workoutId), el('small', null, `${h.exercises.length} exercises · ${fmtMinutes(h.durationSec)}`)), el('small', null, fmtDate(h.completedAt)));
  }));
}

function wireExport() {
  const btn = document.getElementById('export-btn');
  if (btn) btn.addEventListener('click', () => download('shinkafit-data.json', JSON.stringify(api.exportAll(), null, 2)));
}
