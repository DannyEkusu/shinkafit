# SHINKAFIT

**WORKOUT. IMPROVE. REPEAT.**

A free, no-framework workout platform: exercise and workout libraries, structured routines, a built-in interval timer, progress tracking, and optional account sync — built with plain HTML, CSS and vanilla JavaScript so it runs anywhere, including free on GitHub Pages.

Live site: https://dannyekusu.github.io/shinkafit/

## Features

- **Exercise library** — searchable database of exercises with instructions, form tips, common mistakes, beginner modifications and progressions.
- **Workout library** — filterable by difficulty, type, equipment, goal and duration.
- **Routines** — structured weekly training plans you can set as your active plan.
- **Workout timer** — work/rest intervals, sets, rounds, sound cues, vibration, and a manual interval builder (with Tabata-style presets).
- **Progress tracking** — streaks, milestones, history, and a 4-week activity chart.
- **Favorites** — save exercises, workouts and routines.
- **Accounts (optional)** — email/password auth via Supabase, with all data protected by Row Level Security. The app works fully as a guest with no account at all.
- **Offline support** — installable PWA with a service worker that precaches the entire app shell and catalogue data.
- **Admin dashboard** — private, authenticated analytics dashboard (`/admin/`) for usage statistics. Not linked from the public site and blocked in `robots.txt`.
- **Accessibility** — semantic HTML, labeled forms, keyboard-navigable menus/tabs/modals, focus states, reduced-motion support, skip link.
- **Privacy-conscious analytics** — anonymous, aggregate, opt-out event tracking. No health data, no free text, no PII.

Everything above is **free** — there is no paywalled functionality anywhere in the app. `premium.html` exists only as a placeholder for a possible future paid tier and does not process any payments.

## Project structure

```
shinkafit/
├── index.html                 Homepage
├── workouts.html               Workout library (search + filters)
├── workout.html                Single workout detail (?id=)
├── exercises.html              Exercise library (search + filters)
├── exercise.html                Single exercise detail (?id=)
├── routines.html                Routine library (search + filters)
├── routine.html                  Single routine detail (?id=)
├── timer.html                    Workout timer (?workout= / ?exercise= / ?routine=&day= / manual)
├── progress.html                 Streaks, history, milestones, favorites
├── profile.html                  Training profile (experience, goals, equipment)
├── settings.html                 Appearance, reminders, privacy, account, danger zone
├── login.html / signup.html       Authentication
├── premium.html                   Free-vs-premium explainer (no payments processed)
├── privacy.html                   Plain-language privacy policy
├── 404.html                       Custom not-found page (used by GitHub Pages automatically)
├── manifest.json                  PWA manifest
├── service-worker.js              Offline precache + runtime caching
├── robots.txt / sitemap.xml
│
├── css/
│   ├── style.css                  Design tokens, reset, base, layout, header/footer/nav
│   ├── components.css             Buttons, cards, forms, modals, tabs, toasts, etc.
│   ├── pages.css                  Page-specific layout (hero, timer, detail, progress…)
│   └── responsive.css             Breakpoints: 320/375/414/768/1024/1440+
│
├── js/
│   ├── config.js                  Public Supabase URL + anon key (fill these in)
│   ├── theme.js                   Pre-paint theme flash prevention
│   ├── storage.js                 Safe localStorage wrapper + cross-tab sync
│   ├── ui.js                      Safe DOM builder, modals, tabs, toasts, formatting helpers
│   ├── search.js                  Typo-tolerant fuzzy search engine
│   ├── filters.js                 Reusable filterable/sortable library view
│   ├── auth.js                    Supabase Auth (signup/login/logout/reset/delete) over fetch
│   ├── api.js                     Catalogue loader, local data repo, REST client, sync engine
│   ├── favorites.js                Favorite toggling (local + synced)
│   ├── analytics.js                Anonymous, opt-out product analytics
│   ├── notifications.js            Workout reminders (foreground Notifications API)
│   ├── navigation.js                Site chrome: icon sprite, theme toggle, account menu, install prompt
│   ├── app.js                       Boots on every page: chrome, service worker, sync, global search
│   ├── home.js / workouts.js / exercises.js / routines.js
│   ├── workout-detail.js / exercise-detail.js / routine-detail.js
│   ├── timer.js                     Timer engine
│   ├── progress.js / profile.js / settings.js / login.js / signup.js
│
├── data/
│   ├── exercises.json               Exercise database (id, instructions, tips, progressions…)
│   ├── workouts.json                Workout database (blocks, sets/reps, format)
│   ├── routines.json                 Weekly routine schedules
│   └── media-sources.json            Registry for future licensed exercise media (empty by default)
│
├── assets/
│   └── icons/                        App icons, favicon, Open Graph image
│
├── admin/
│   ├── index.html                    Admin analytics dashboard (auth + admin-allow-list gated)
│   ├── css/admin.css
│   └── js/admin.js
│
└── backend/
    └── database-schema.sql           Full Supabase schema: tables, RLS policies, admin functions
```

## Running it locally

No build step. Any static file server works:

```bash
npx serve .
# or
python3 -m http.server 8080
```

Then open `http://localhost:8080`. All core features (library, search, timer, routines, progress, favorites) work immediately with **no configuration** — data is stored in your browser via `localStorage`.

## Deploying to GitHub Pages

1. Push this repository to GitHub.
2. In **Settings → Pages**, set the source to the `main` branch, root folder.
3. The site will be published at `https://<your-username>.github.io/<repo-name>/`.
4. `404.html` at the repo root is automatically used by GitHub Pages for unmatched routes.
5. Because the app uses only relative paths, it works whether it's served from a domain root or a subpath like `/shinkafit/`.

No server-side code, build step, or environment variables are needed for the free core app.

## Setting up accounts (optional — Supabase)

Accounts, cross-device sync, and the admin dashboard require a free [Supabase](https://supabase.com) project. Without this, SHINKAFIT still works completely as a guest experience.

1. Create a free project at supabase.com.
2. Open the **SQL Editor** and run the entire contents of `backend/database-schema.sql` once. This creates all tables, enables Row Level Security on every one of them, and creates the SECURITY DEFINER functions the app and admin dashboard rely on.
3. In your Supabase project settings, copy:
   - **Project URL** (e.g. `https://abcd1234.supabase.co`)
   - **anon / publishable key** (safe to expose publicly — it only works because of RLS)
4. Paste both into `js/config.js`:
   ```js
   SUPABASE_URL: 'https://abcd1234.supabase.co',
   SUPABASE_ANON_KEY: 'eyJ...',
   ```
5. **Never** paste the `service_role` / `secret` key anywhere in this repository. It is not needed by anything in this codebase.
6. (Optional) In Supabase Auth settings, you can require email confirmation, customize email templates, and set the site URL for password-reset redirects to your deployed domain.

### Granting yourself admin access

The admin dashboard (`/admin/`) has no way to grant itself access — that is intentional. After you (or anyone) has signed up through the site:

```sql
select promote_to_admin('your-email@example.com');
```

Run this once in the Supabase SQL Editor. It is the *only* way to add an admin — there is no UI for it, by design, so admin access can never be granted from client-side code.

## Security notes

- Every table with personal data has **Row Level Security enabled**; a person can only read/write their own rows.
- The `admin_users` allow-list has **no client policies at all** — it can only be read by the SECURITY DEFINER functions, and only ever edited from the SQL Editor.
- `analytics_events` is **insert-only** for clients; it can only be read back through the admin functions, which check `is_admin()` first.
- Passwords are never stored by this app in any form — they go straight to Supabase Auth over HTTPS.
- Only the public anon/publishable key is ever used client-side.

## Content licensing

`data/media-sources.json` is a registry for exercise photos/videos. **Before adding any media file to an exercise**, register its source, license, and permitted uses there. The starter exercise database ships with no media — only text instructions — to avoid any risk of using unlicensed content.

## Browser support

Modern evergreen browsers (Chrome, Edge, Firefox, Safari — desktop and mobile). The app degrades gracefully: if `Notification`, `share`, or `vibrate` APIs are unavailable, those specific conveniences are skipped without breaking anything else.
