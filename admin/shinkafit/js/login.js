import * as auth from './auth.js';
import { onLogin } from './api.js';
import { el, icon, toast, setBusy, announce } from './ui.js';
import { track } from './analytics.js';

const form = document.getElementById('login-form');
const errBox = document.getElementById('login-error');
const notConfigured = document.getElementById('not-configured');
const resetLink = document.getElementById('reset-link');
const resetForm = document.getElementById('reset-form');
const resetBox = document.getElementById('reset-box');

if (!auth.isConfigured()) { notConfigured.hidden = false; form.hidden = true; }

if (new URLSearchParams(location.search).get('mode') === 'reset' || location.hash.includes('type=recovery')) {
  if (auth.consumeRecoveryHash()) { location.replace('settings.html#password'); }
}

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  errBox.hidden = true;
  const email = form.email.value.trim(); const password = form.password.value;
  const btn = form.querySelector('button[type="submit"]');
  setBusy(btn, true, 'Logging in…');
  try {
    await auth.signIn(email, password);
    await onLogin();
    track('login');
    announce('Logged in');
    location.href = new URLSearchParams(location.search).get('next') || 'index.html';
  } catch (err) {
    errBox.hidden = false; errBox.textContent = err.message || 'Could not log in.';
  } finally { setBusy(btn, false); }
});

resetLink?.addEventListener('click', (e) => { e.preventDefault(); resetBox.hidden = !resetBox.hidden; });
resetForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = resetForm.querySelector('button[type="submit"]');
  setBusy(btn, true, 'Sending…');
  try { await auth.requestPasswordReset(resetForm.email.value.trim()); toast('If that email has an account, a reset link is on its way.', { type: 'success' }); resetForm.reset(); resetBox.hidden = true; }
  catch (err) { toast(err.message || 'Could not send reset email.', { type: 'error' }); }
  finally { setBusy(btn, false); }
});
