/* Site chrome shared by every page: icon sprite, header account area, theme toggle,
 * offline banner, install prompt, and active-link highlighting.
 * Header/nav/footer markup itself lives in each HTML file (for SEO and no-JS baseline);
 * this module only wires up the interactive parts and fills the account slot. */
import { el, icon as mkIcon, mount, dropdown, toast } from './ui.js';
import { isConfigured, isLoggedIn, currentUser } from './auth.js';
import * as auth from './auth.js';
import * as api from './api.js';
import * as store from './storage.js';

/* ---------- icon sprite (static, developer-authored markup — not user data) ---------- */
const ICONS = {
  logo: '<path d="M4 19l8-4.5 8 4.5" stroke="#4aa8ff"/><path d="M4 13.5l8-4.5 8 4.5" stroke="#40c7be"/><path d="M4 8l8-4.5 8 4.5" stroke="#4ee58a"/>',
  home: '<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9a1 1 0 0 0 1 1h4v-6h2v6h4a1 1 0 0 0 1-1v-9"/>',
  dumbbell: '<path d="M4 9v6M2 10v4M20 9v6M22 10v4M7 12h10M7 7v10M17 7v10"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
  routine: '<path d="M4 5h16M4 12h16M4 19h10"/><path d="m17 16 2.5 2.5L21 17"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6M19 6l1.5-1.5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.5-6 8-6s8 2 8 6"/>',
  heart: '<path d="M12 20s-7-4.4-9.5-8.6C.8 8 2.3 4.8 5.6 4.1 8 3.6 10 4.7 12 7c2-2.3 4-3.4 6.4-2.9 3.3.7 4.8 3.9 3.1 7.3C19 15.6 12 20 12 20z"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/>',
  play: '<path d="M7 5v14l12-7z"/>',
  pause: '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>',
  skip: '<path d="M6 5v14l10-7z"/><path d="M17 5v14"/>',
  reset: '<path d="M4 4v6h6"/><path d="M20 12a8 8 0 1 1-2.6-5.9L20 8.4"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  flame: '<path d="M12 2s-1 4-4 6.5C5.5 10.5 5 13 5 14.5A7 7 0 0 0 19 15c0-3-1.5-5-3-6.5.3 2-.6 3-1.5 3.3C15 9 14 5 12 2z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.6 1z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  login: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l-5-5 5-5"/><path d="M15 12H3"/>',
  bell: '<path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  wifiOff: '<path d="M3 3l18 18"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M5 12.5a10 10 0 0 1 4-2.4M19 12.5a10 10 0 0 0-3-2.1M12 20h.01"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  trash: '<path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 10.6l6.8-3.2M8.6 13.4l6.8 3.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  lock: '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 6 8 7 8-7"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V6z"/>',
  barChart: '<path d="M4 20V10M12 20V4M20 20v-7"/><path d="M2 20h20"/>',
  trophy: '<path d="M8 21h8M12 17v4"/><path d="M6 4h12v4a6 6 0 0 1-12 0z"/><path d="M6 5H3v2a3 3 0 0 0 3 3M18 5h3v2a3 3 0 0 1-3 3"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  arrowLeft: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
  spinner: '<path d="M12 3a9 9 0 1 0 9 9"/>',
};
export function injectIconSprite() {
  if (document.getElementById('sf-sprite')) return;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'sf-sprite'; svg.setAttribute('class', 'sprite'); svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = Object.entries(ICONS).map(([name, path]) =>
    `<symbol id="i-${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</symbol>`).join('');
  document.body.prepend(svg);
}

/* ---------- theme ---------- */
const THEME_ORDER = ['system', 'light', 'dark'];
const THEME_ICON = { system: 'monitor', light: 'sun', dark: 'moon' };
const THEME_LABEL = { system: 'Use system theme', light: 'Switch to light theme', dark: 'Switch to dark theme' };
export function initThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  const paint = () => {
    const t = store.device().theme;
    btn.innerHTML = ''; btn.append(mkIcon(THEME_ICON[t] || 'monitor'));
    btn.setAttribute('aria-label', THEME_LABEL[t] || 'Change theme');
    document.documentElement.setAttribute('data-theme', t);
  };
  btn.addEventListener('click', () => {
    const cur = store.device().theme; const next = THEME_ORDER[(THEME_ORDER.indexOf(cur) + 1) % THEME_ORDER.length];
    store.setDevice({ theme: next }); paint();
  });
  paint();
}

/* ---------- offline banner ---------- */
export function initOfflineBanner() {
  let bar = document.getElementById('offline-banner');
  const show = () => {
    if (navigator.onLine) { bar?.remove(); bar = null; return; }
    if (bar) return;
    bar = el('div', { id: 'offline-banner', class: 'offline-banner', role: 'status' }, mkIcon('wifiOff'), "You're offline — core workout features still work, saved from your last visit.");
    document.body.insertBefore(bar, document.body.firstChild.nextSibling || document.body.firstChild);
  };
  window.addEventListener('online', () => { show(); toast('Back online — syncing your data', { type: 'success' }); api.syncNow(); });
  window.addEventListener('offline', show);
  show();
}

/* ---------- account area ---------- */
function initials(name, email) {
  const src = (name || email || '?').trim();
  return src.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
}

export function initAccountArea() {
  const slot = document.getElementById('account-slot');
  if (!slot) return;
  const render = () => {
    slot.innerHTML = '';
    if (!isLoggedIn()) {
      slot.append(el('a', { class: 'btn btn--secondary btn--sm', href: 'login.html' }, 'Log in'), el('a', { class: 'btn btn--sm', href: 'signup.html' }, 'Sign up'));
      return;
    }
    const u = currentUser();
    const btn = el('button', { class: 'avatar', type: 'button' }, initials(u.name, u.email));
    const menu = el('div', { class: 'dropdown__menu', role: 'menu' },
      el('a', { role: 'menuitem', href: 'profile.html' }, mkIcon('user'), 'Profile'),
      el('a', { role: 'menuitem', href: 'progress.html' }, mkIcon('barChart'), 'Progress'),
      el('a', { role: 'menuitem', href: 'settings.html' }, mkIcon('settings'), 'Settings'),
      el('button', { role: 'menuitem', type: 'button', onClick: doLogout }, mkIcon('logout'), 'Log out'));
    const wrap = el('div', { class: 'dropdown' }, btn, menu);
    slot.append(wrap);
    dropdown({ button: btn, menu });
  };
  async function doLogout() {
    const res = await api.logout();
    if (res.ok) track('logout');
    if (!res.ok) { toast(`${res.pending} change${res.pending === 1 ? '' : 's'} could not be saved yet. Log out anyway from Settings if you want to discard them.`, { type: 'error' }); return; }
    toast('Logged out'); render();
    if (/profile|settings|progress/i.test(location.pathname)) location.href = 'index.html';
  }
  auth.onAuthChange(render);
  render();
}

/* ---------- install prompt ---------- */
let deferredPrompt = null;
export function initInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferredPrompt = e;
    document.querySelectorAll('[data-install-btn]').forEach((b) => { b.hidden = false; });
    track('install_prompt_shown');
  });
  document.querySelectorAll('[data-install-btn]').forEach((b) => {
    b.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') { toast('SHINKAFIT installed. Find it on your home screen.', { type: 'success' }); track('install_accepted'); }
      deferredPrompt = null; b.hidden = true;
    });
  });
  window.addEventListener('appinstalled', () => { document.querySelectorAll('[data-install-btn]').forEach((b) => { b.hidden = true; }); });
}

/* ---------- active link ---------- */
export function markActiveNav() {
  const here = (location.pathname.split('/').pop() || 'index.html');
  document.querySelectorAll('.primary-nav a, .bottom-nav a').forEach((a) => {
    const target = a.getAttribute('href').split('/').pop();
    if (target === here || (target === 'index.html' && here === '')) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

export function initChrome() {
  injectIconSprite();
  markActiveNav();
  initThemeToggle();
  initOfflineBanner();
  initAccountArea();
  initInstallPrompt();
}
