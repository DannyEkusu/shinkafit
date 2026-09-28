/* Search engine: partial matches, aliases, keywords, small typo tolerance.
 * Every query token must match something in the item (AND), scored by where it matches. */

export function norm(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
export function tokenize(q) { return norm(q).split(' ').filter(Boolean); }

/* true when edit distance between a and b is <= max (max is 1 or 2) */
function within(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return false;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1); // swapped letters
    }
  }
  return dp[a.length][b.length] <= max;
}

const cache = new WeakMap();
function indexOf(item, spec) {
  let idx = cache.get(item);
  if (idx) return idx;
  const nameN = norm(item[spec.name]);
  idx = {
    nameN, nameC: nameN.replace(/ /g, ''), words: nameN.split(' '),
    aliases: (item[spec.aliases] || []).map((a) => { const n = norm(a); return { n, c: n.replace(/ /g, ''), words: n.split(' ') }; }),
    kw: (spec.keywords || []).map((f) => [].concat(item[f] ?? []).map(norm).filter(Boolean)).flat(),
    text: (spec.text || []).map((f) => norm([].concat(item[f] ?? []).join(' '))).join(' '),
  };
  idx.kwWords = idx.kw.flatMap((k) => k.split(' '));
  cache.set(item, idx);
  return idx;
}

function scoreToken(t, ix) {
  let best = 0;
  const bump = (v) => { if (v > best) best = v; };
  if (ix.nameN === t) bump(100);
  else if (ix.nameN.startsWith(t)) bump(70);
  else if (ix.words.some((w) => w.startsWith(t))) bump(55);
  else if (ix.nameC.includes(t)) bump(45);
  else if (ix.nameN.includes(t)) bump(35);
  for (const a of ix.aliases) {
    if (a.n === t || a.c === t) bump(85);
    else if (a.n.startsWith(t)) bump(60);
    else if (a.words.some((w) => w.startsWith(t))) bump(45);
    else if (a.c.includes(t)) bump(30);
  }
  for (const k of ix.kw) { if (k === t) bump(22); }
  for (const w of ix.kwWords) { if (w === t) bump(20); else if (w.startsWith(t)) bump(14); else if (t.length >= 4 && w.includes(t)) bump(8); }
  if (t.length >= 3 && ix.text && (` ${ix.text}`).includes(` ${t}`)) bump(3);
  if (best === 0 && t.length >= 4) {
    const cands = [...ix.words, ...ix.aliases.flatMap((a) => a.words), ix.nameC];
    if (cands.some((w) => within(t, w, 1))) bump(18);
    else if (t.length >= 7 && cands.some((w) => within(t, w, 2))) bump(10);
  }
  return best;
}

export const EXERCISE_SPEC = { name: 'name', aliases: 'aliases', keywords: ['tags', 'muscleGroups', 'equipment', 'goals', 'type', 'difficulty'], text: ['description'] };
export const WORKOUT_SPEC = { name: 'name', aliases: 'tags', keywords: ['tags', 'muscleGroups', 'equipment', 'goal', 'type', 'difficulty', 'durationBucket'], text: ['description'] };
export const ROUTINE_SPEC = { name: 'name', aliases: 'tags', keywords: ['level', 'goal', 'equipment', 'timeBucket'], text: ['description'] };

/* returns [{item, score}] sorted by score (best first) */
export function search(items, query, spec) {
  const toks = tokenize(query);
  if (!toks.length) return items.map((item) => ({ item, score: 0 }));
  const phrase = norm(query);
  const out = [];
  for (const item of items) {
    const ix = indexOf(item, spec);
    let total = 0; let ok = true;
    for (const t of toks) { const s = scoreToken(t, ix); if (!s) { ok = false; break; } total += s; }
    if (!ok) continue;
    if (ix.nameN.includes(phrase)) total += 30;
    out.push({ item, score: total });
  }
  return out.sort((a, b) => b.score - a.score || String(a.item[spec.name]).localeCompare(String(b.item[spec.name])));
}
