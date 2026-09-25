import * as auth from './auth.js';
import { onLogin } from './api.js';
import { setBusy, announce } from './ui.js';
import { track } from './analytics.js';

const form = document.getElementById('signup-form');
const errBox = document.getElementById('signup-error');
const notConfigured = document.getElementById('not-configured');
const confirmBox = document.getElementById('confirm-box');

if (!auth.isConfigured()) { notConfigured.hidden = false; form.hidden = true; }

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  errBox.hidden = true;
  const name = form.name.value.trim(); const email = form.email.value.trim(); const password = form.password.value; const confirm = form.confirm.value;
  if (password.length < 8) { errBox.hidden = false; errBox.textContent = 'Password must be at least 8 characters.'; return; }
  if (password !== confirm) { errBox.hidden = false; errBox.textContent = 'Passwords do not match.'; return; }
  const btn = form.querySelector('button[type="submit"]');
  setBusy(btn, true, 'Creating account…');
  try {
    const { needsConfirmation } = await auth.signUp(email, password, name);
    track('signup');
    if (needsConfirmation) { form.hidden = true; confirmBox.hidden = false; }
    else { await onLogin(); track('login'); announce('Account created'); location.href = 'index.html'; }
  } catch (err) { errBox.hidden = false; errBox.textContent = err.message || 'Could not create account.'; }
  finally { setBusy(btn, false); }
});
