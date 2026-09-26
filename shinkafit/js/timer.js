/* Workout timer: work/rest intervals, sets & rounds, sound cues, background-tab-safe
 * countdown (uses wall-clock time so a throttled tab does not lose time), and session logging.
 * Can run: a full workout/routine-day (?workout= / ?routine=&day=), a single exercise (?exercise=),
 * or a manual stopwatch-less interval timer with no query params. */
import * as api from './api.js';
import { logWorkout, logExercise } from './api.js';
import { el, icon, mount, clear, fmtClock, cleanId, getParam, toast, announce, setBusy } from './ui.js';
import { completionNotify } from './notifications.js';
import { track } from './analytics.js';

const root = document.getElementById('timer-root');
const { exById, wById, rById } = await api.getCatalog();

/* ---------- build the session plan: a flat list of {label, kind, seconds, exerciseId, setIndex} ---------- */
function fromWorkout(w) {
  const steps = [];
  const push = (kind, seconds, label, exerciseId, meta) => steps.push({ kind, seconds, label, exerciseId, ...meta });
  for (const b of w.blocks) {
    const ex = exById.get(b.exerciseId);
    const name = ex ? ex.name : b.exerciseId;
    for (let s = 1; s <= b.sets; s++) {
      const work = b.seconds || Math.max(8, (b.reps || 8) * 3);
      push('work', work, name, b.exerciseId, { reps: b.reps, setLabel: b.sets > 1 ? `Set ${s}/${b.sets}` : null, phase: b.phase, timedByReps: !b.seconds });
      const isLast = s === b.sets;
      if (b.rest > 0 && !(isLast && b === w.blocks[w.blocks.length - 1])) push('rest', b.rest, 'Rest', null, { phase: b.phase });
    }
  }
  return { title: w.name, steps, meta: w };
}
function circuitSteps(w) {
  const steps = [];
  for (let round = 1; round <= w.rounds; round++) {
    for (const b of w.blocks) {
      const ex = exById.get(b.exerciseId); const name = ex ? ex.name : b.exerciseId;
      const work = b.seconds || Math.max(8, (b.reps || 8) * 3);
      steps.push({ kind: 'work', seconds: work, label: name, exerciseId: b.exerciseId, setLabel: `Round ${round}/${w.rounds}`, phase: b.phase, timedByReps: !b.seconds });
      if (b.rest > 0) steps.push({ kind: 'rest', seconds: b.rest, label: 'Rest', phase: b.phase });
    }
    if (round < w.rounds && w.restBetweenRounds > 0) steps.push({ kind: 'rest', seconds: w.restBetweenRounds, label: 'Round rest', phase: 'main' });
  }
  return { title: w.name, steps, meta: w };
}
function buildSession() {
  const wid = cleanId(getParam('workout'));
  const exid = cleanId(getParam('exercise'));
  const rid = cleanId(getParam('routine'));
  const day = Number(getParam('day'));
  if (wid && wById.has(wid)) { const w = wById.get(wid); return w.format === 'circuit' ? circuitSteps(w) : fromWorkout(w); }
  if (rid && rById.has(rid) && day) { const r = rById.get(rid); const s = r.schedule.find((x) => x.day === day && x.workoutId); if (s) { const w = wById.get(s.workoutId); return w ? (w.format === 'circuit' ? circuitSteps(w) : fromWorkout(w)) : null; } }
  if (exid && exById.has(exid)) {
    const e = exById.get(exid); const steps = [];
    for (let s = 1; s <= e.sets; s++) { steps.push({ kind: 'work', seconds: e.duration || Math.max(8, (Number(String(e.reps).split('-')[1] || e.reps) || 8) * 3), label: e.name, exerciseId: e.id, setLabel: e.sets > 1 ? `Set ${s}/${e.sets}` : null, timedByReps: !e.duration, reps: e.reps });
      if (s < e.sets) steps.push({ kind: 'rest', seconds: 45, label: 'Rest' }); }
    return { title: e.name, steps, meta: null };
  }
  return null; /* manual mode */
}

const session = buildSession();

/* ---------- manual interval builder (no query params) ---------- */
function manualSetup() {
  const workIn = el('input', { class: 'input', type: 'number', min: 5, max: 600, value: 40, 'aria-label': 'Work seconds' });
  const restIn = el('input', { class: 'input', type: 'number', min: 0, max: 300, value: 20, 'aria-label': 'Rest seconds' });
  const roundsIn = el('input', { class: 'input', type: 'number', min: 1, max: 50, value: 8, 'aria-label': 'Rounds' });
  const presets = [[20, 10, 8, 'Tabata 20/10 ×8'], [40, 20, 6, '40/20 ×6'], [45, 15, 5, '45/15 ×5'], [60, 30, 4, '60/30 ×4']];
  const startBtn = el('button', { class: 'btn btn--lg btn--block', type: 'button' }, icon('play'), 'Start interval timer');
  startBtn.addEventListener('click', () => {
    const work = Math.max(5, Math.min(600, Number(workIn.value) || 40));
    const rest = Math.max(0, Math.min(300, Number(restIn.value) || 0));
    const rounds = Math.max(1, Math.min(50, Number(roundsIn.value) || 1));
    const steps = [];
    for (let i = 1; i <= rounds; i++) { steps.push({ kind: 'work', seconds: work, label: 'Work', setLabel: `Round ${i}/${rounds}` }); if (rest && i < rounds) steps.push({ kind: 'rest', seconds: rest, label: 'Rest' }); }
    runSession({ title: 'Interval timer', steps, meta: null });
  });
  mount(root,
    el('div', { class: 'container section--tight' },
      el('div', { class: 'panel' },
        el('h1', null, 'Workout timer'), el('p', { class: 'muted' }, 'Start a workout from the library, or set your own work/rest intervals below.'),
        el('div', { class: 'preset-row' }, presets.map(([w, r, n, lbl]) => el('button', { class: 'btn btn--secondary btn--sm', type: 'button', onClick: () => { workIn.value = w; restIn.value = r; roundsIn.value = n; } }, lbl))),
        el('div', { class: 'form-row' },
          el('div', { class: 'field' }, el('label', { for: 'w' }, 'Work (seconds)'), workIn),
          el('div', { class: 'field' }, el('label', { for: 'r' }, 'Rest (seconds)'), restIn),
          el('div', { class: 'field' }, el('label', { for: 'n' }, 'Rounds'), roundsIn)),
        startBtn),
      el('div', { class: 'section--tight' }, el('a', { class: 'btn btn--ghost', href: 'workouts.html' }, 'Or pick a full workout instead'))));
}

/* ---------- sound cues (WebAudio beeps; no audio files to download) ---------- */
let actx = null;
function beep(freq, ms, vol = 0.18) {
  if (!api.getPrefs) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const osc = actx.createOscillator(); const gain = actx.createGain();
    osc.frequency.value = freq; osc.type = 'sine';
    gain.gain.setValueAtTime(vol, actx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + ms / 1000);
    osc.connect(gain); gain.connect(actx.destination);
    osc.start(); osc.stop(actx.currentTime + ms / 1000);
  } catch { /* audio unavailable (autoplay policy, unsupported browser): timer still works visually */ }
}
function cueFor(kind) { if (kind === 'work') { beep(880, 150); setTimeout(() => beep(1046, 180), 160); } else if (kind === 'rest') beep(440, 200); else beep(660, 120); }
function vibrate(pattern) { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch { /* ignore */ } }

/* ---------- the running session ---------- */
function runSession(sess) {
  if (sess.meta && sess.meta.exerciseCount !== undefined) track('workout_started', { item_id: sess.meta.id, item_type: 'workout', difficulty: sess.meta.difficulty });
  const soundOn = { get: () => JSON.parse(localStorage.getItem('sf:device') || '{}').sound !== false };
  const vibrateOn = { get: () => JSON.parse(localStorage.getItem('sf:device') || '{}').vibrate !== false };
  let idx = -1; let phase = 'ready'; let remaining = 5; let paused = false; let raf = null; let deadline = 0;
  let pausedRemaining = 0; const total = sess.steps.reduce((s, x) => s + x.seconds, 0) + 5;
  let elapsedBefore = 0; const startedAt = new Date().toISOString();
  const completedExercises = new Map();

  const phaseEl = el('div', { class: 'timer__phase' }, 'Get ready');
  const clock = el('div', { class: 'timer__clock', 'aria-live': 'off' }, '0:05');
  const exName = el('p', { class: 'timer__exercise' }, sess.title);
  const subEl = el('p', { class: 'timer__sub' }, sess.steps[0] ? sess.steps[0].label : '');
  const tipEl = el('p', { class: 'timer__tip' });
  const overallBar = el('div', { class: 'progress' }, el('span'));
  const overallSmall = el('small', null, el('span', null, '0:00'), el('span', null, fmtClock(total)));
  const timerBox = el('div', { class: 'timer', dataset: { phase } }, phaseEl, clock, exName, subEl, tipEl,
    el('div', { class: 'timer__overall' }, overallBar, overallSmall));

  const pauseBtn = el('button', { class: 'btn btn--lg', type: 'button' }, icon('pause'), 'Pause');
  const skipBtn = el('button', { class: 'btn btn--secondary', type: 'button' }, icon('skip'), 'Skip');
  const resetBtn = el('button', { class: 'btn btn--ghost', type: 'button' }, icon('reset'), 'Restart');
  const controls = el('div', { class: 'timer__controls' }, pauseBtn, skipBtn, resetBtn);

  const sessionList = el('ol', { class: 'session-list', 'aria-label': 'Workout steps' });
  function paintList() {
    clear(sessionList);
    sess.steps.forEach((s, i) => {
      if (s.kind === 'rest' && !sessionList.dataset.showRest) return;
      const item = el('li', { class: `session-item${i < idx ? ' is-done' : ''}`, 'aria-current': i === idx ? 'step' : null },
        el('input', { type: 'checkbox', checked: i < idx, disabled: true, 'aria-hidden': 'true', tabindex: -1 }),
        el('div', null, el('span', { class: 'session-item__name' }, s.label), s.setLabel ? el('small', null, s.setLabel) : null),
        el('small', null, s.kind === 'work' && s.timedByReps ? `${s.reps} reps` : fmtClock(s.seconds)));
      sessionList.append(item);
    });
  }
  paintList();

  mount(root,
    el('div', { class: 'container section--tight timer-layout' },
      timerBox,
      el('div', { class: 'panel' }, el('h2', null, 'Up next'), sessionList,
        el('div', { class: 'btn-row', style: { marginTop: '1rem' } }, el('a', { class: 'btn btn--ghost btn--sm', href: 'workouts.html' }, 'Choose a different workout')))),
    el('div', { class: 'container section--tight' }, controls));

  function setPhaseUI(kind) { timerBox.dataset.phase = kind; }
  function announcePhase(text) { phaseEl.textContent = text; announce(text); }

  function startStep(i, secondsOverride) {
    idx = i;
    if (idx >= sess.steps.length) return finish();
    const step = sess.steps[idx];
    phase = step.kind; setPhaseUI(phase);
    remaining = secondsOverride ?? step.seconds;
    deadline = performance.now() + remaining * 1000;
    exName.textContent = step.kind === 'rest' ? 'Rest' : step.label;
    subEl.textContent = step.setLabel || (step.kind === 'work' && step.timedByReps ? `${step.reps} reps — move at your own pace` : '');
    tipEl.textContent = step.kind === 'rest' ? 'Breathe, shake it out, get ready for the next move.' : '';
    announcePhase(step.kind === 'rest' ? `Rest, ${step.setLabel || ''}`.trim() : `${step.label}${step.setLabel ? `, ${step.setLabel}` : ''}`);
    if (soundOn.get()) cueFor(step.kind);
    if (vibrateOn.get()) vibrate(step.kind === 'work' ? [80] : [40, 60, 40]);
    paintList();
    tick();
  }

  function tick() {
    cancelAnimationFrame(raf);
    if (paused) return;
    const now = performance.now();
    remaining = Math.max(0, (deadline - now) / 1000);
    clock.textContent = fmtClock(remaining);
    const elapsedTotal = elapsedBefore + ((phase === 'ready' ? 5 : sess.steps[idx]?.seconds || 0) - remaining);
    overallBar.firstChild.style.width = `${Math.min(100, (elapsedTotal / total) * 100)}%`;
    overallSmall.firstChild.textContent = fmtClock(elapsedTotal);
    if (remaining <= 0) return advance();
    if (remaining <= 3.02 && remaining > 2.02 && soundOn.get() && phase !== 'ready') beep(700, 90, 0.12);
    raf = requestAnimationFrame(tick);
  }

  function advance() {
    if (phase !== 'ready' && idx >= 0) {
      elapsedBefore += sess.steps[idx].seconds;
      const step = sess.steps[idx];
      if (step.kind === 'work' && step.exerciseId) {
        const rec = completedExercises.get(step.exerciseId) || { sets: 0, reps: 0, seconds: 0 };
        rec.sets += 1; rec.reps += step.timedByReps ? (parseInt(step.reps, 10) || 0) : 0; rec.seconds += step.timedByReps ? 0 : step.seconds;
        completedExercises.set(step.exerciseId, rec);
      }
    } else if (phase === 'ready') elapsedBefore += 5;
    startStep(idx + 1);
  }

  function finish() {
    phase = 'done'; setPhaseUI('done'); cancelAnimationFrame(raf);
    phaseEl.textContent = 'Workout complete';
    clock.textContent = '✓';
    exName.textContent = 'Nice work!';
    subEl.textContent = `You finished ${sess.title}.`;
    tipEl.textContent = '';
    controls.replaceChildren(
      el('a', { class: 'btn btn--lg', href: sess.meta ? (sess.meta.exerciseCount !== undefined ? `workout.html?id=${sess.meta.id}` : 'workouts.html') : 'workouts.html' }, 'Done'),
      el('button', { class: 'btn btn--secondary', type: 'button', onClick: () => location.reload() }, icon('reset'), 'Do it again'));
    overallBar.firstChild.style.width = '100%';
    announce('Workout complete. Nice work.');
    if (soundOn.get()) { beep(660, 150); setTimeout(() => beep(880, 150), 160); setTimeout(() => beep(1100, 220), 320); }
    vibrate([100, 60, 100, 60, 200]);
    completionNotify(sess.title);
    const completedAt = new Date().toISOString();
    const durationSec = elapsedBefore;
    if (sess.meta && sess.meta.exerciseCount !== undefined) {
      logWorkout({ workoutId: sess.meta.id, startedAt, completedAt, durationSec, exercises: [...completedExercises].map(([exerciseId, v]) => ({ exerciseId, ...v })) });
      track('workout_completed', { item_id: sess.meta.id, item_type: 'workout', duration_sec: durationSec });
    } else if (sess.steps[0]?.exerciseId && sess.steps.every((s) => s.kind !== 'work' || s.exerciseId === sess.steps[0].exerciseId)) {
      const rec = completedExercises.get(sess.steps[0].exerciseId) || { sets: 0, reps: 0, seconds: 0 };
      logExercise(sess.steps[0].exerciseId, rec);
      track('exercise_completed', { item_id: sess.steps[0].exerciseId, item_type: 'exercise', duration_sec: durationSec });
    }
    track('timer_used', { duration_sec: durationSec });
    toast('Great session — saved to your history.', { type: 'success' });
  }

  pauseBtn.addEventListener('click', () => {
    paused = !paused;
    if (paused) { pausedRemaining = deadline - performance.now(); cancelAnimationFrame(raf); pauseBtn.innerHTML = ''; pauseBtn.append(icon('play'), 'Resume'); announce('Paused'); }
    else { deadline = performance.now() + pausedRemaining; pauseBtn.innerHTML = ''; pauseBtn.append(icon('pause'), 'Pause'); announce('Resumed'); tick(); }
  });
  skipBtn.addEventListener('click', () => {
    if (phase === 'done') return;
    cancelAnimationFrame(raf);
    elapsedBefore += phase === 'ready' ? 5 : sess.steps[idx].seconds;
    startStep(idx + 1);
  });
  resetBtn.addEventListener('click', async () => { const { confirmDialog } = await import('./ui.js'); if (await confirmDialog({ title: 'Restart workout?', message: 'This will reset the timer back to the beginning. Nothing will be saved yet.', confirmLabel: 'Restart' })) location.reload(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !paused && phase !== 'done') tick(); });
  window.addEventListener('beforeunload', (e) => { if (phase !== 'done' && idx >= 0) { e.preventDefault(); e.returnValue = ''; } });

  startStep(0, 5);
}

if (!session) manualSetup(); else runSession(session);
