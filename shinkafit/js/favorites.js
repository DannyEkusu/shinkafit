/* Favourites: exercises, workouts and routines. Works offline (localStorage) and
 * syncs to the backend when logged in (see api.js enqueue/pull for the merge rules). */
import * as store from './storage.js';
import { enqueue } from './api.js';
import { toast, announce } from './ui.js';
import { track } from './analytics.js';

const KEY = 'favorites';
const list = () => store.get(KEY, []);

export function isFavorite(type, id) { return list().some((f) => f.t === type && f.id === id); }
export function getFavorites(type) { const l = list(); return type ? l.filter((f) => f.t === type) : l; }

export function addFavorite(type, id) {
  if (isFavorite(type, id)) return;
  store.set(KEY, [...list(), { t: type, id, at: new Date().toISOString() }]);
  enqueue({ k: 'fav+', type, item: id });
  track('favorite_added', { item_id: id, item_type: type });
}
export function removeFavorite(type, id) {
  store.set(KEY, list().filter((f) => !(f.t === type && f.id === id)));
  enqueue({ k: 'fav-', type, item: id });
}
export function toggleFavorite(type, id, label = 'This item') {
  if (isFavorite(type, id)) { removeFavorite(type, id); toast(`${label} removed from favorites`); announce('Removed from favorites'); return false; }
  addFavorite(type, id); toast(`${label} added to favorites`); announce('Added to favorites'); return true;
}

/* a favorite-toggle icon button, kept in sync with storage across tabs/instances */
export function favoriteButton(type, id, label) {
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'icon-btn';
  const paint = () => {
    const on = isFavorite(type, id);
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? `Remove ${label} from favorites` : `Add ${label} to favorites`);
    btn.innerHTML = '';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'icon'); svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = '<use href="#i-heart"></use>';
    btn.append(svg);
  };
  btn.addEventListener('click', () => { toggleFavorite(type, id, label); paint(); });
  store.on(KEY, paint);
  paint();
  return btn;
}
