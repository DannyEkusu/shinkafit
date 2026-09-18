# SHINKAFIT

**WORKOUT. IMPROVE. REPEAT.**

A free, lightweight workout library, routine builder, and timer built with
vanilla HTML/CSS/JS. Designed to work well on low-end phones and slow
connections, and to keep working offline once the PWA layer lands.

## Status

Phase 1 complete: brand identity + base UI shell (homepage, nav, design tokens).

See `/docs/architecture.md` (add the architecture doc here) for the full stack
decision: Supabase (auth/db), Paystack (payments), Umami (analytics),
GitHub Pages (hosting) — all on free tiers.

## Structure

```
index.html          Homepage
css/
  tokens.css         Design tokens (color, type, spacing)
  base.css           Reset + shared elements
  home.css           Homepage-specific styles
js/
  nav.js             Mobile nav toggle
assets/              Images, icons (empty — filled in later phases)
data/                Exercise/routine JSON (empty — filled in Phase 4)
manifest.json        PWA manifest (full offline support comes later)
```

## Running locally

No build step. Open `index.html` directly, or serve the folder with any
static server, e.g.:

```
npx serve .
```

## Deployment

GitHub Pages, pointed at `shinkafit.app`.

## License / disclaimer

Not medical advice. See exercise pages for form guidance and safety notes
once the library ships.
