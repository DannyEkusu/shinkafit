/* UI helpers: safe DOM building (no innerHTML with data), components, formatting.
 * Every string is inserted as a text node, which prevents HTML/script injection (XSS). */

const SVG_NS = 'http://www.w3.org/2000/svg';
const BOOL_ATTRS = new Set(['hidden', 'disabled', 'checked', 'selected', 'required', 'open', 'readonly', 'multiple', 'autofocus']);

/* only same-site relative links or https links are allowed as hrefs */
export function safeUrl(u) {
  const s = String(u ?? '').trim();
  if (!s) return '#';
  if (/^(https:\/\/|\.{0,2}\/|[a-z0-9_-]+(\.html)?(\?|#|$|\/))/i.test(s) && !/^\s*(javascript|data|vbscript):/i.test(s)) return s;
  return '#';
}

export function el(tag, props, ...kids) {
  const node = document.createElement(tag);
  applyProps(node, props);
  append(node, kids);
  return node;
}

function applyProps(node, props) {
  if (!props) return;
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'href') node.setAttribute('href', safeUrl(v));
    else if (k === 'value') node.value = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (BOOL_ATTRS.has(k)) { node.setAttribute(k, ''); if (k in node) try { node[k] = true; } catch { /* ignore */ } }
    else node.setAttribute(k, v === true ? '' : String(v));
  }
}

function append(node, kids) {
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
}

export function svgEl(tag, attrs, ...kids) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v !== null && v !== undefined) n.setAttribute(k, String(v));
  for (const kid of kids.flat()) if (kid) n.append(kid);
  return n;
}

export function icon(name, cls = '') {
  const s = svgEl('svg', { class: `icon ${cls}`.trim(), 'aria-hidden': 'true', focusable: 'false' });
  s.append(svgEl('use', { href: `#i-${name}` }));
  return s;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
export function mount(node, ...kids) { clear(node); append(node, kids); return node; }
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ---------- URL params (validated) ---------- */
export function getParam(name) { return new URLSearchParams(location.search).get(name); }
/* ids are lowercase letters, digits and hyphens only: anything else is rejected */
export function cleanId(v) { return typeof v === 'string' && /^[a-z0-9-]{1,80}$/.test(v) ? v : null; }

/* ---------- formatting ---------- */
export const pad2 = (n) => String(n).padStart(2, '0');
export function fmtClock(sec) {
  sec = Math.max(0, Math.round(sec));
  return `${pad2(Math.floor(sec / 60))}:${pad2(sec % 60)}`;
}
export function fmtMinutes(sec) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}
export function dayKey(d = new Date()) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
export function parseDayKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
/* ISO weekday: Monday = 1 ... Sunday = 7 */
export function isoDow(d = new Date()) { return d.getDay() === 0 ? 7 : d.getDay(); }
export const DOW_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const DOW_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export function fmtDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
export function plural(n, one, many = `${one}s`) { return `${n} ${n === 1 ? one : many}`; }
export function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
export function truncate(s, n) { s = String(s ?? ''); return s.length > n ? `${s.slice(0, n - 1)}…` : s; }
export function download(filename, text, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = el('a', { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* screen-reader announcements */
export function announce(msg) {
  let r = document.getElementById('sr-live');
  if (!r) { r = el('div', { id: 'sr-live', class: 'sr-live', role: 'status', 'aria-live': 'polite' }); document.body.append(r); }
  r.textContent = '';
  setTimeout(() => { r.textContent = msg; }, 30);
}

/* ---------- toast ---------- */
export function toast(message, { type = 'info', action, ms = 3600 } = {}) {
  let box = document.getElementById('toasts');
  if (!box) { box = el('div', { id: 'toasts', class: 'toasts', 'aria-live': 'polite' }); document.body.append(box); }
  const t = el('div', { class: `toast toast--${type}`, role: type === 'error' ? 'alert' : 'status' }, el('span', null, message));
  if (action) t.append(el('button', { type: 'button', onClick: () => { action.onClick(); t.remove(); } }, action.label));
  box.append(t);
  setTimeout(() => t.remove(), action ? ms * 2.5 : ms);
  return t;
}

/* ---------- badges ---------- */
export const badge = (text, cls = '') => el('span', { class: `badge ${cls}`.trim() }, text);
export const levelBadge = (level) => el('span', { class: 'badge badge--level', dataset: { level } }, level);
export function tagList(items, max = 4) {
  return el('div', { class: 'tags' }, items.slice(0, max).map((t) => el('span', { class: 'tag' }, t)));
}

/* ---------- progress ---------- */
export function progressBar(pct, label) {
  const bar = el('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(pct), 'aria-label': label || 'Progress' });
  const fill = el('span'); fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  bar.append(fill);
  return bar;
}

export function ring({ size = 220, stroke = 12, pct = 0 } = {}) {
  const r = (size - stroke) / 2; const c = 2 * Math.PI * r;
  const svg = svgEl('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}`, 'aria-hidden': 'true' });
  const track = svgEl('circle', { class: 'ring__track', cx: size / 2, cy: size / 2, r, 'stroke-width': stroke });
  const val = svgEl('circle', { class: 'ring__value', cx: size / 2, cy: size / 2, r, 'stroke-width': stroke, 'stroke-dasharray': c, 'stroke-dashoffset': c });
  svg.append(track, val);
  const label = el('div', { class: 'ring__label' });
  const wrap = el('div', { class: 'ring' }, svg, label);
  return { el: wrap, label, set(p) { val.setAttribute('stroke-dashoffset', String(c * (1 - Math.max(0, Math.min(1, p))))); } };
}

/* one notch per day: filled when you trained, dashed when planned */
export function tickStrip(days) {
  return el('div', { class: 'ticks', role: 'list', 'aria-label': 'Last seven days' }, days.map((d) =>
    el('div', { class: `tick${d.done ? ' tick--done' : ''}${d.today ? ' tick--today' : ''}${d.plan && !d.done ? ' tick--plan' : ''}`, role: 'listitem', 'aria-label': `${d.full}: ${d.done ? 'trained' : d.plan ? 'planned' : 'rest'}` },
      el('i'), el('span', null, d.label))));
}

/* ---------- states ---------- */
export function emptyState({ iconName = 'search', title, text, actions = [] }) {
  return el('div', { class: 'state', role: 'status' }, icon(iconName), el('h3', null, title), text ? el('p', null, text) : null,
    actions.length ? el('div', { class: 'btn-row' }, actions) : null);
}
export function errorState({ title = 'Something went wrong', text, onRetry, actions = [] }) {
  const acts = [...actions];
  if (onRetry) acts.unshift(el('button', { class: 'btn btn--secondary', type: 'button', onClick: onRetry }, 'Try again'));
  return el('div', { class: 'state state--error', role: 'alert' }, icon('info'), el('h3', null, title), text ? el('p', null, text) : null,
    acts.length ? el('div', { class: 'btn-row' }, acts) : null);
}
export function skeletons(n = 6) {
  return Array.from({ length: n }, () => el('div', { class: 'skeleton', 'aria-hidden': 'true' }));
}
export function notice(text, variant = 'info', iconName = 'info') {
  return el('div', { class: `notice notice--${variant}`, role: variant === 'danger' ? 'alert' : 'note' }, icon(iconName), el('p', null, text));
}

/* ---------- modal (native <dialog>: focus trap, Esc to close, focus restore) ---------- */
export function openModal({ title, content, actions = [], className = '', labelledBy = 'modal-title' }) {
  const opener = document.activeElement;
  const dlg = el('dialog', { class: `modal ${className}`.trim(), 'aria-labelledby': labelledBy });
  const closeBtn = el('button', { class: 'icon-btn icon-btn--sm', type: 'button', 'aria-label': 'Close', onClick: () => dlg.close() }, icon('x'));
  const inner = el('div', { class: 'modal__inner' },
    el('div', { class: 'modal__head' }, el('h2', { id: labelledBy }, title || ''), closeBtn), content,
    actions.length ? el('div', { class: 'modal__actions' }, actions.map((a) => el('button', {
      class: `btn ${a.variant ? `btn--${a.variant}` : ''}`.trim(), type: 'button',
      onClick: async () => { const keep = a.onClick ? await a.onClick(dlg) : undefined; if (keep !== false && a.close !== false) dlg.close(a.value ?? 'ok'); },
    }, a.label))) : null);
  dlg.append(inner);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => { dlg.remove(); if (opener && opener.focus) try { opener.focus(); } catch { /* ignore */ } });
  document.body.append(dlg);
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  return dlg;
}

export function confirmDialog({ title = 'Are you sure?', message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    let result = false;
    const dlg = openModal({
      title, content: el('p', null, message),
      actions: [{ label: cancelLabel, variant: 'secondary', onClick: () => { result = false; } }, { label: confirmLabel, variant: danger ? 'danger' : '', onClick: () => { result = true; } }],
    });
    dlg.addEventListener('close', () => resolve(result));
  });
}

/* ---------- tabs (WAI-ARIA tabs pattern with arrow-key support) ---------- */
export function tabs(items, { selected, onChange, label = 'Sections' } = {}) {
  const list = el('div', { class: 'tabs', role: 'tablist', 'aria-label': label });
  const panels = el('div');
  const btns = new Map();
  const panelMap = new Map();
  const select = (id, focus = false) => {
    for (const [k, b] of btns) {
      const on = k === id;
      b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1;
      panelMap.get(k).hidden = !on;
      if (on && focus) b.focus();
    }
    if (onChange) onChange(id);
  };
  items.forEach((it) => {
    const b = el('button', { class: 'tab', role: 'tab', type: 'button', id: `tab-${it.id}`, 'aria-controls': `panel-${it.id}`, onClick: () => select(it.id) }, it.label);
    const p = el('div', { class: 'tabpanel', role: 'tabpanel', id: `panel-${it.id}`, 'aria-labelledby': `tab-${it.id}`, tabindex: 0 }, it.panel);
    btns.set(it.id, b); panelMap.set(it.id, p); list.append(b); panels.append(p);
  });
  list.addEventListener('keydown', (e) => {
    const ids = items.map((i) => i.id); const cur = ids.findIndex((id) => btns.get(id).getAttribute('aria-selected') === 'true');
    let n = -1;
    if (e.key === 'ArrowRight') n = (cur + 1) % ids.length; else if (e.key === 'ArrowLeft') n = (cur - 1 + ids.length) % ids.length;
    else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = ids.length - 1;
    if (n >= 0) { e.preventDefault(); select(ids[n], true); }
  });
  select(selected || items[0].id);
  return { list, panels, select, root: el('div', null, list, panels) };
}

/* ---------- dropdown menu ---------- */
export function dropdown({ button, menu }) {
  menu.hidden = true;
  button.setAttribute('aria-haspopup', 'true'); button.setAttribute('aria-expanded', 'false');
  const close = () => { menu.hidden = true; button.setAttribute('aria-expanded', 'false'); };
  const open = () => { menu.hidden = false; button.setAttribute('aria-expanded', 'true'); const f = menu.querySelector('a,button'); if (f) f.focus(); };
  button.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden ? open() : close(); });
  document.addEventListener('click', (e) => { if (!menu.contains(e.target) && e.target !== button) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { close(); button.focus(); } });
  return { close, open };
}

/* ---------- form helpers ---------- */
export function chipGroup({ name, options, selected = [], type = 'checkbox', onChange }) {
  const wrap = el('div', { class: 'chips' });
  options.forEach((o, i) => {
    const value = typeof o === 'string' ? o : o.value; const label = typeof o === 'string' ? o : o.label;
    const input = el('input', { type, name, value, id: `${name}-${i}`, checked: selected.includes(value) });
    input.addEventListener('change', () => { if (onChange) onChange(getChecked(wrap)); });
    wrap.append(el('label', { class: 'chip', for: `${name}-${i}` }, input, el('span', null, label)));
  });
  return wrap;
}
export function getChecked(root) { return [...root.querySelectorAll('input:checked')].map((i) => i.value); }

export function setBusy(btn, busy, label) {
  btn.disabled = busy;
  if (busy) { btn.dataset.label = btn.textContent; btn.textContent = label || 'Please wait…'; }
  else if (btn.dataset.label) btn.textContent = btn.dataset.label;
}
