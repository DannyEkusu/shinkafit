import * as store from './storage.js';
import * as api from './api.js';
import * as auth from './auth.js';
import * as notif from './notifications.js';
import { el, icon, mount, clear, chipGroup, getChecked, toast, setBusy, confirmDialog, download } from './ui.js';
import { track } from './analytics.js';

/* ---------- appearance ---------- */
const dev = store.device();
document.querySelectorAll('input[name="theme"]').forEach((r) => { r.checked = r.value === dev.theme; r.addEventListener('change', () => store.setDevice({ theme: r.value })); });
document.querySelectorAll('input[name="motion"]').forEach((r) => { r.checked = r.value === dev.motion; r.addEventListener('change', () => { store.setDevice({ motion: r.value }); applyMotion(); }); });
function applyMotion() {
  const m = store.device().motion; const root = document.documentElement;
  const reduce = m === 'reduce' || (m === 'system' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  root.toggleAttribute('data-motion', reduce); if (reduce) root.setAttribute('data-motion', 'reduce'); else root.removeAttribute('data-motion');
}
applyMotion();

/* ---------- device toggles ---------- */
function wireSwitch(id, key) {
  const input = document.getElementById(id);
  if (!input) return;
  input.checked = store.device()[key] !== false;
  input.addEventListener('change', () => store.setDevice({ [key]: input.checked }));
}
wireSwitch('sw-sound', 'sound');
wireSwitch('sw-vibrate', 'vibrate');
wireSwitch('sw-lowdata', 'lowData');
wireSwitch('sw-analytics', 'analytics');

/* ---------- notifications ---------- */
const prefs = api.getPrefs();
const reminderSwitch = document.getElementById('sw-reminders');
const reminderBox = document.getElementById('reminder-options');
const timeInput = document.getElementById('reminder-time');
const dayChips = document.getElementById('reminder-days');
const permNotice = document.getElementById('notif-permission');

mount(dayChips, chipGroup({ name: 'reminderDays', options: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], selected: (prefs.reminders.days || []).map((d) => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d - 1]) }));
timeInput.value = prefs.reminders.time || '18:00';
reminderSwitch.checked = Boolean(prefs.reminders.enabled);
reminderBox.hidden = !reminderSwitch.checked;

function paintPermission() {
  const p = notif.permission();
  if (p === 'unsupported') { permNotice.hidden = false; permNotice.textContent = 'Notifications are not supported in this browser. Reminders will not appear, but everything else still works.'; }
  else if (p === 'denied') { permNotice.hidden = false; permNotice.textContent = 'Notifications are blocked for this site in your browser settings. Enable them there to receive reminders.'; }
  else permNotice.hidden = true;
}
paintPermission();

function saveReminders() {
  const dayIdx = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  notif.setReminder({ enabled: reminderSwitch.checked, time: timeInput.value, days: getChecked(dayChips).map((d) => dayIdx[d]) });
}
reminderSwitch.addEventListener('change', async () => {
  reminderBox.hidden = !reminderSwitch.checked;
  if (reminderSwitch.checked) { const p = await notif.requestPermission(); paintPermission(); if (p !== 'granted') { reminderSwitch.checked = false; reminderBox.hidden = true; } else track('reminder_enabled'); }
  saveReminders();
  notif.startReminderClock();
});
timeInput.addEventListener('change', saveReminders);
dayChips.addEventListener('change', saveReminders);
document.getElementById('sw-completion')?.addEventListener('change', (e) => api.savePrefs({ completionNotify: e.target.checked }));
const compSwitch = document.getElementById('sw-completion'); if (compSwitch) compSwitch.checked = prefs.completionNotify !== false;

/* ---------- account ---------- */
const accountSection = document.getElementById('account-section');
const guestSection = document.getElementById('guest-section');
function paintAccount() {
  const loggedIn = auth.isLoggedIn();
  accountSection.hidden = !loggedIn; guestSection.hidden = loggedIn;
  if (loggedIn) { const u = auth.currentUser(); document.getElementById('account-email').textContent = u.email || ''; }
}
auth.onAuthChange(paintAccount); paintAccount();

document.getElementById('logout-btn')?.addEventListener('click', async () => {
  const res = await api.logout();
  if (res.ok) track('logout');
  if (!res.ok) { toast(`${res.pending} unsynced change${res.pending === 1 ? '' : 's'}. Log out anyway?`, { type: 'error', action: { label: 'Log out anyway', onClick: async () => { await api.logout({ force: true }); location.href = 'index.html'; } } }); return; }
  toast('Logged out'); location.href = 'index.html';
});

document.getElementById('password-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target; const btn = f.querySelector('button[type="submit"]'); const msg = document.getElementById('password-msg');
  msg.hidden = true;
  if (f.newPassword.value.length < 8) { msg.hidden = false; msg.textContent = 'Password must be at least 8 characters.'; msg.className = 'notice notice--danger'; return; }
  if (f.newPassword.value !== f.confirmPassword.value) { msg.hidden = false; msg.textContent = 'Passwords do not match.'; msg.className = 'notice notice--danger'; return; }
  setBusy(btn, true, 'Updating…');
  try { await auth.updatePassword(f.newPassword.value); msg.hidden = false; msg.className = 'notice notice--success'; msg.textContent = 'Password updated.'; f.reset(); }
  catch (err) { msg.hidden = false; msg.className = 'notice notice--danger'; msg.textContent = err.message || 'Could not update password.'; }
  finally { setBusy(btn, false); }
});

document.getElementById('export-btn')?.addEventListener('click', () => download('shinkafit-data.json', JSON.stringify(api.exportAll(), null, 2)));

document.getElementById('clear-device-btn')?.addEventListener('click', async () => {
  if (await confirmDialog({ title: 'Clear data on this device?', message: 'This removes your favorites, history and preferences from this device only. If you are logged in, your account data in the cloud is not affected until you sync again.', confirmLabel: 'Clear device data', danger: true })) {
    store.clearUserData(); toast('Device data cleared'); setTimeout(() => location.reload(), 600);
  }
});

document.getElementById('delete-account-btn')?.addEventListener('click', async () => {
  if (!(await confirmDialog({ title: 'Delete your account?', message: 'This permanently deletes your account and all cloud data: history, favorites, profile and preferences. This cannot be undone.', confirmLabel: 'Delete permanently', danger: true }))) return;
  try { await auth.deleteAccount(); store.clearUserData(); toast('Account deleted'); location.href = 'index.html'; }
  catch (err) { toast(err.message || 'Could not delete account.', { type: 'error' }); }
});
