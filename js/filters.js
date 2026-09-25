/* Reusable library view: search box, filter chips, sort, count, results, "show more".
 * Filter and search state lives in the URL, so a filtered list can be bookmarked or shared. */
import { el, icon, mount, clear, debounce, emptyState, announce, skeletons } from './ui.js';
import { search } from './search.js';

const SEP = '~';

export function readState(groups) {
  const p = new URLSearchParams(location.search);
  const sel = {};
  for (const g of groups) {
    const raw = p.get(g.key);
    sel[g.key] = raw ? raw.split(SEP).filter((v) => g.options.includes(v)) : [];
  }
  return { q: (p.get('q') || '').slice(0, 80), sort: p.get('sort') || '', sel };
}

function writeState(state, groups) {
  const p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  if (state.sort && state.sort !== 'relevance') p.set('sort', state.sort);
  for (const g of groups) if (state.sel[g.key].length) p.set(g.key, state.sel[g.key].join(SEP));
  const qs = p.toString();
  history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}`);
}

export function applyFilters(items, groups, sel) {
  return items.filter((item) => groups.every((g) => !sel[g.key].length || g.match(item, sel[g.key])));
}

/* cfg: { mount, items, groups, spec, sorts, renderCard, noun, pageSize, onSearch, emptyActions } */
export function mountLibrary(cfg) {
  const { items, groups, spec, sorts, renderCard, noun = 'result', pageSize = 24 } = cfg;
  const state = readState(groups);
  if (!sorts.some((s) => s.value === state.sort)) state.sort = sorts[0].value;
  let shown = pageSize;

  const input = el('input', { class: 'input', type: 'search', id: 'lib-q', placeholder: cfg.placeholder || 'Search by name, muscle, equipment…', autocomplete: 'off', 'aria-label': 'Search', value: state.q, maxlength: 80 });
  const clearBtn = el('button', { class: 'icon-btn clear-btn', type: 'button', 'aria-label': 'Clear search', hidden: !state.q, onClick: () => { input.value = ''; state.q = ''; clearBtn.hidden = true; input.focus(); refresh(true); } }, icon('x'));
  const searchBox = el('div', { class: 'search-box' }, icon('search'), input, clearBtn);
  const sortSel = el('select', { class: 'input', id: 'lib-sort', 'aria-label': 'Sort by', onChange: (e) => { state.sort = e.target.value; refresh(true); } },
    sorts.map((s) => el('option', { value: s.value, selected: s.value === state.sort }, s.label)));

  const countPill = el('span', { class: 'count-pill', hidden: true });
  const filtersEl = el('details', { class: 'filters' }, el('summary', null, icon('filter'), 'Filters', countPill));
  const body = el('div', { class: 'filters__body' });
  for (const g of groups) {
    const chips = el('div', { class: 'chips' });
    g.options.forEach((opt, i) => {
      const id = `f-${g.key}-${i}`;
      const cb = el('input', { type: 'checkbox', id, value: opt, checked: state.sel[g.key].includes(opt) });
      cb.addEventListener('change', () => {
        const set = new Set(state.sel[g.key]); cb.checked ? set.add(opt) : set.delete(opt);
        state.sel[g.key] = g.options.filter((o) => set.has(o)); refresh(true);
      });
      chips.append(el('label', { class: 'chip', for: id }, cb, el('span', null, opt)));
    });
    body.append(el('fieldset', null, el('legend', null, g.label), chips));
  }
  const clearAll = el('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: resetAll }, 'Clear all filters');
  body.append(el('div', null, clearAll));
  filtersEl.append(body);
  /* filters are always visible on wide screens, collapsible on phones */
  const mq = window.matchMedia('(min-width: 1024px)');
  const syncOpen = () => { filtersEl.open = mq.matches || Object.values(state.sel).some((a) => a.length > 0); };
  syncOpen(); mq.addEventListener('change', () => { filtersEl.open = mq.matches; });

  const count = el('p', { class: 'result-count', 'aria-live': 'polite' });
  const results = el('div', { class: 'card-grid' }, skeletons(6));
  const more = el('div', { class: 'row' });
  more.style.justifyContent = 'center';
  more.style.marginTop = '1.5rem';

  mount(cfg.mount, el('div', { class: 'toolbar' }, searchBox, sortSel), filtersEl, count, results, more);

  function activeCount() { return Object.values(state.sel).reduce((n, a) => n + a.length, 0); }
  function resetAll() {
    for (const g of groups) state.sel[g.key] = [];
    state.q = ''; input.value = ''; clearBtn.hidden = true;
    body.querySelectorAll('input').forEach((c) => { c.checked = false; });
    refresh(true);
  }

  function compute() {
    const filtered = applyFilters(items, groups, state.sel);
    let ranked = search(filtered, state.q, spec);
    const s = sorts.find((x) => x.value === state.sort);
    if (s && s.cmp && !(s.value === 'relevance')) ranked = [...ranked].sort((a, b) => s.cmp(a.item, b.item));
    return ranked.map((r) => r.item);
  }

  function refresh(resetPage) {
    if (resetPage) shown = pageSize;
    const list = compute();
    const n = activeCount();
    countPill.hidden = !n; countPill.textContent = String(n);
    writeState(state, groups);
    count.textContent = `${list.length} ${list.length === 1 ? noun : `${noun}s`}`;
    clear(results); clear(more);
    if (!list.length) {
      results.className = '';
      results.append(emptyState({
        title: `No ${noun}s found`,
        text: state.q ? `Nothing matches “${state.q}” with the current filters. Try a shorter word or remove a filter.` : 'No items match these filters. Try removing one.',
        actions: [el('button', { class: 'btn', type: 'button', onClick: resetAll }, 'Clear search and filters'), ...(cfg.emptyActions || [])],
      }));
      announce(`No ${noun}s found`);
      return;
    }
    results.className = 'card-grid';
    list.slice(0, shown).forEach((item) => results.append(renderCard(item)));
    if (list.length > shown) more.append(el('button', { class: 'btn btn--secondary', type: 'button', onClick: () => { shown += pageSize; refresh(false); } }, `Show more (${list.length - shown} left)`));
  }

  const notify = debounce(() => { if (cfg.onSearch && state.q.trim().length >= 2) cfg.onSearch(state.q.trim(), compute().length); }, 900);
  input.addEventListener('input', () => { state.q = input.value; clearBtn.hidden = !input.value; refresh(true); notify(); });
  refresh(true);
  return { refresh, state };
}
