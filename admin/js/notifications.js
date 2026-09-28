/* Workout reminders via the Notifications API. No push server: reminders only fire
 * while SHINKAFIT is open (a page or the installed PWA), checked once a minute.
 * Explains the limitation up front rather than promising background alerts. */
import { getPrefs, savePrefs } from './api.js';
import { isoDow, pad2 } from './ui.js';

export const isSupported = () => typeof Notification !== 'undefined';
export const permission = () => (isSupported() ? Notification.permission : 'unsupported');

export async function requestPermission() {
  if (!isSupported()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try { return await Notification.requestPermission(); } catch { return 'denied'; }
}

export function setReminder({ enabled, time, days }) {
  savePrefs({ reminders: { ...getPrefs().reminders, ...(enabled !== undefined ? { enabled } : {}), ...(time ? { time } : {}), ...(days ? { days } : {}) } });
}

function notify(title, body) {
  if (!isSupported() || Notification.permission !== 'granted') return;
  try {
    navigator.serviceWorker?.getRegistration().then((reg) => {
      if (reg) reg.showNotification(title, { body, icon: '/assets/icons/icon-192.png', badge: '/assets/icons/icon-192.png', tag: 'sf-reminder' });
      else new Notification(title, { body, icon: '/assets/icons/icon-192.png' });
    }).catch(() => { new Notification(title, { body, icon: '/assets/icons/icon-192.png' }); });
  } catch { /* notifications can throw in odd embedded contexts; fail silently */ }
}

let lastFired = null;
function tick() {
  const { reminders } = getPrefs();
  if (!reminders?.enabled || Notification?.permission !== 'granted') return;
  const now = new Date();
  const hhmm = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  const today = isoDow(now);
  const key = `${now.toDateString()}-${hhmm}`;
  if (hhmm === reminders.time && (reminders.days || []).includes(today) && lastFired !== key) {
    lastFired = key;
    notify('Time to train — SHINKAFIT', "Today's session is ready when you are. WORKOUT. IMPROVE. REPEAT.");
  }
}
export function startReminderClock() {
  if (typeof window === 'undefined' || window.__sfReminderClock) return;
  window.__sfReminderClock = setInterval(tick, 30000);
  tick();
}

export function completionNotify(workoutName) {
  if (!getPrefs().completionNotify) return;
  notify('Workout complete 💪', `Nice work finishing ${workoutName}. Progress saved.`);
}
