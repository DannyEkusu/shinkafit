import * as api from './api.js';
import { isLoggedIn, currentUser, onAuthChange } from './auth.js';
import { el, icon, mount, chipGroup, getChecked, toast, setBusy } from './ui.js';

const { meta } = await api.getCatalog();
const guestNotice = document.getElementById('guest-notice');
const form = document.getElementById('profile-form');

function paintGuestState() {
  guestNotice.hidden = isLoggedIn();
}
onAuthChange(paintGuestState);
paintGuestState();

const p = api.getProfile();
form.displayName.value = p.displayName || currentUser()?.name || '';
form.experience.value = p.experience;
form.sessionsPerWeek.value = p.sessionsPerWeek;

const goalsWrap = document.getElementById('goals-chips');
const typesWrap = document.getElementById('types-chips');
const equipWrap = document.getElementById('equip-chips');
mount(goalsWrap, chipGroup({ name: 'goals', options: meta.goals, selected: p.goals }));
mount(typesWrap, chipGroup({ name: 'workoutTypes', options: meta.workoutTypes, selected: p.workoutTypes }));
mount(equipWrap, chipGroup({ name: 'equipment', options: meta.equipment, selected: p.equipment }));

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const btn = form.querySelector('button[type="submit"]');
  setBusy(btn, true, 'Saving…');
  api.saveProfile({
    displayName: form.displayName.value.trim().slice(0, 40),
    experience: form.experience.value,
    sessionsPerWeek: Math.max(1, Math.min(7, Number(form.sessionsPerWeek.value) || 3)),
    goals: getChecked(goalsWrap), workoutTypes: getChecked(typesWrap), equipment: getChecked(equipWrap).length ? getChecked(equipWrap) : ['No Equipment'],
  });
  setTimeout(() => { setBusy(btn, false); toast('Profile saved', { type: 'success' }); }, 250);
});
