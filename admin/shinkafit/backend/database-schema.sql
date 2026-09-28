-- =============================================================================
-- SHINKAFIT — Supabase (PostgreSQL) database schema
-- =============================================================================
-- How to use this file:
--   1. Create a free project at https://supabase.com.
--   2. Open the SQL editor for your project and run this entire file once.
--   3. Copy your project's "Project URL" and "anon" (or "publishable") key into
--      js/config.js. NEVER paste the "service_role" / "secret" key anywhere in
--      this repository — it must never leave the Supabase dashboard.
--   4. To make an account an admin, run once, after that person has signed up:
--        select promote_to_admin('their-email@example.com');
--
-- Design notes:
--   - Every table that holds personal data has Row Level Security (RLS) ENABLED,
--     with policies that let a person read and write only their own rows.
--   - Exercise/workout/routine content lives in the static data/*.json files, not
--     in the database, so those tables only need to reference item ids as text —
--     there is nothing to keep "in sync" and no public read table is required
--     for the catalogue itself.
--   - analytics_events is insert-only from the client (no select/update/delete),
--     and is never linked to an identifiable user — only to a random device id.
--   - admin_users is the ONLY table that grants elevated access, and it can only
--     be modified from the SQL editor (service_role), never from client code.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- profiles: one row per user, extending auth.users with app-specific fields
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  experience text check (experience in ('beginner', 'intermediate', 'advanced')) default 'beginner',
  goals text[] default '{}',
  workout_types text[] default '{}',
  equipment text[] default '{}',
  sessions_per_week smallint check (sessions_per_week between 1 and 14) default 3,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'One row per user: display name and training preferences (not medical data).';

alter table public.profiles enable row level security;
create policy "profiles: individuals can view their own" on public.profiles for select using (auth.uid() = id);
create policy "profiles: individuals can insert their own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles: individuals can update their own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles: individuals can delete their own" on public.profiles for delete using (auth.uid() = id);

-- -----------------------------------------------------------------------------
-- user_preferences: notification/reminder settings and the weekly plan, one row per user
-- -----------------------------------------------------------------------------
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb,
  plan jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
comment on table public.user_preferences is 'Reminder settings and the weekly workout plan for one user, as JSON blobs owned entirely by that user.';

alter table public.user_preferences enable row level security;
create policy "user_preferences: individuals manage their own" on public.user_preferences for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- favorites: exercises / workouts / routines a user has saved
-- -----------------------------------------------------------------------------
create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  item_type text not null check (item_type in ('exercise', 'workout', 'routine')),
  item_id text not null check (char_length(item_id) <= 80),
  created_at timestamptz not null default now(),
  unique (user_id, item_type, item_id)
);
comment on table public.favorites is 'Exercises, workouts and routines a user has favorited. item_id refers to an id in the static catalogue JSON.';
create index if not exists favorites_user_idx on public.favorites (user_id);

alter table public.favorites enable row level security;
create policy "favorites: individuals manage their own" on public.favorites for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- completed_workouts / completed_exercises: workout history
-- -----------------------------------------------------------------------------
create table if not exists public.completed_workouts (
  id uuid primary key default gen_random_uuid(), -- client-generated, so offline completions can sync without duplicating
  user_id uuid not null references auth.users (id) on delete cascade,
  workout_id text not null check (char_length(workout_id) <= 80),
  routine_id text check (char_length(routine_id) <= 80),
  started_at timestamptz not null,
  completed_at timestamptz not null,
  duration_seconds integer not null check (duration_seconds between 0 and 86400),
  exercises_completed smallint not null default 0 check (exercises_completed >= 0),
  created_at timestamptz not null default now(),
  check (completed_at >= started_at)
);
comment on table public.completed_workouts is 'One row per completed workout session. No exercise performance beyond counts/durations is stored.';
create index if not exists completed_workouts_user_idx on public.completed_workouts (user_id, completed_at desc);

alter table public.completed_workouts enable row level security;
create policy "completed_workouts: individuals view their own" on public.completed_workouts for select using (auth.uid() = user_id);
create policy "completed_workouts: individuals insert their own" on public.completed_workouts for insert with check (auth.uid() = user_id);
create policy "completed_workouts: individuals delete their own" on public.completed_workouts for delete using (auth.uid() = user_id);
-- Deliberately no UPDATE policy: a completed session is an immutable historical fact once logged.

create table if not exists public.completed_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  completed_workout_id uuid references public.completed_workouts (id) on delete cascade,
  exercise_id text not null check (char_length(exercise_id) <= 80),
  completed_at timestamptz not null,
  sets_done smallint check (sets_done >= 0),
  reps_done smallint check (reps_done >= 0),
  seconds_done integer check (seconds_done >= 0),
  created_at timestamptz not null default now()
);
comment on table public.completed_exercises is 'One row per completed exercise, either standalone or as part of a completed_workouts row.';
create index if not exists completed_exercises_user_idx on public.completed_exercises (user_id, completed_at desc);
create index if not exists completed_exercises_workout_idx on public.completed_exercises (completed_workout_id);

alter table public.completed_exercises enable row level security;
create policy "completed_exercises: individuals view their own" on public.completed_exercises for select using (auth.uid() = user_id);
create policy "completed_exercises: individuals insert their own" on public.completed_exercises for insert with check (auth.uid() = user_id);
create policy "completed_exercises: individuals delete their own" on public.completed_exercises for delete using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- analytics_events: anonymous, aggregate product analytics (insert-only from clients)
-- -----------------------------------------------------------------------------
create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  anon_id uuid not null,          -- random per-device id (js/storage.js anonId()); never tied to a user id
  event_name text not null check (event_name in (
    'session_start','workout_viewed','exercise_viewed','routine_viewed','search',
    'workout_started','workout_completed','exercise_completed','timer_used','favorite_added',
    'signup','login','logout','install_prompt_shown','install_accepted','reminder_enabled'
  )),
  props jsonb not null default '{}'::jsonb,
  page text,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now()
);
comment on table public.analytics_events is 'Anonymous, aggregate product usage events. Never contains an account id, email, free-text input, or health data.';
create index if not exists analytics_events_name_time_idx on public.analytics_events (event_name, occurred_at desc);
create index if not exists analytics_events_anon_idx on public.analytics_events (anon_id);

alter table public.analytics_events enable row level security;
-- Clients (identified only by the public anon API key, logged in or not) may INSERT events, and nothing else.
create policy "analytics_events: anyone can insert" on public.analytics_events for insert with check (true);
-- No select/update/delete policy is created for the anon/authenticated roles, so only an
-- admin (via the SECURITY DEFINER functions below) or the service_role key can ever read this table.

-- -----------------------------------------------------------------------------
-- admin_users: allow-list of accounts permitted to view the admin dashboard
-- -----------------------------------------------------------------------------
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);
comment on table public.admin_users is 'Allow-list of accounts that may use the admin dashboard. Only ever edited from the SQL editor (service_role) — never from client code.';

alter table public.admin_users enable row level security;
-- No policies at all: PostgREST denies all client access by default, including to admins
-- themselves. Admin status is only ever checked server-side inside the SECURITY DEFINER
-- functions below, and only ever changed by someone with SQL-editor / service_role access.

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;
comment on function public.is_admin() is 'True if the currently authenticated user is on the admin allow-list.';

-- Run manually from the SQL editor after someone has signed up, e.g.:
--   select promote_to_admin('owner@example.com');
create or replace function public.promote_to_admin(target_email text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare target_id uuid;
begin
  select id into target_id from auth.users where email = target_email;
  if target_id is null then
    raise exception 'No user found with email %', target_email;
  end if;
  insert into public.admin_users (user_id) values (target_id) on conflict do nothing;
end;
$$;
comment on function public.promote_to_admin(text) is 'Admin-only bootstrap helper: run from the SQL editor (never exposed to clients) to grant admin access by email.';
revoke all on function public.promote_to_admin(text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- delete_my_account: lets a logged-in user permanently delete their own account
-- -----------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  delete from auth.users where id = auth.uid(); -- cascades to every table above via foreign keys
end;
$$;
comment on function public.delete_my_account() is 'Deletes the caller''s own auth.users row; all app tables cascade-delete via their foreign keys.';
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- -----------------------------------------------------------------------------
-- Admin read functions: the ONLY way statistics are ever read back out.
-- Each checks is_admin() first and raises an error for anyone else, so the
-- dashboard's queries are safe even though the underlying tables have no
-- SELECT policy for normal users.
-- -----------------------------------------------------------------------------
create or replace function public.admin_overview()
returns table (
  total_users bigint, new_users_7d bigint, new_users_30d bigint,
  active_users_7d bigint, active_users_30d bigint,
  workouts_completed bigint, workouts_completed_7d bigint,
  exercises_completed bigint, total_favorites bigint
)
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  return query select
    (select count(*) from auth.users),
    (select count(*) from auth.users where created_at >= now() - interval '7 days'),
    (select count(*) from auth.users where created_at >= now() - interval '30 days'),
    (select count(distinct anon_id) from public.analytics_events where occurred_at >= now() - interval '7 days'),
    (select count(distinct anon_id) from public.analytics_events where occurred_at >= now() - interval '30 days'),
    (select count(*) from public.completed_workouts),
    (select count(*) from public.completed_workouts where completed_at >= now() - interval '7 days'),
    (select count(*) from public.completed_exercises),
    (select count(*) from public.favorites);
end;
$$;

create or replace function public.admin_daily_activity(days integer default 30)
returns table (day date, new_users bigint, workouts_completed bigint, active_devices bigint)
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  return query
  with d as (select generate_series(current_date - (days - 1), current_date, interval '1 day')::date as day)
  select d.day,
    coalesce((select count(*) from auth.users u where u.created_at::date = d.day), 0),
    coalesce((select count(*) from public.completed_workouts w where w.completed_at::date = d.day), 0),
    coalesce((select count(distinct e.anon_id) from public.analytics_events e where e.occurred_at::date = d.day), 0)
  from d order by d.day;
end;
$$;

create or replace function public.admin_top_items(item_kind text, event text, lim integer default 10)
returns table (item_id text, n bigint)
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  if item_kind not in ('exercise', 'workout', 'routine') then raise exception 'Invalid item_kind'; end if;
  if event not in ('workout_viewed','exercise_viewed','routine_viewed','workout_completed','exercise_completed','favorite_added') then
    raise exception 'Invalid event';
  end if;
  return query
  select e.props->>'item_id' as item_id, count(*) as n
  from public.analytics_events e
  where e.event_name = event and e.props->>'item_type' = item_kind and e.props->>'item_id' is not null
  group by 1 order by n desc limit lim;
end;
$$;

create or replace function public.admin_search_terms(lim integer default 15)
returns table (search_source text, n bigint)
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  return query
  select coalesce(e.props->>'source','other'), count(*) from public.analytics_events e
  where e.event_name = 'search' group by 1 order by 2 desc limit lim;
end;
$$;

revoke all on function public.admin_overview() from public, anon;
revoke all on function public.admin_daily_activity(integer) from public, anon;
revoke all on function public.admin_top_items(text, text, integer) from public, anon;
revoke all on function public.admin_search_terms(integer) from public, anon;
grant execute on function public.admin_overview() to authenticated;
grant execute on function public.admin_daily_activity(integer) to authenticated;
grant execute on function public.admin_top_items(text, text, integer) to authenticated;
grant execute on function public.admin_search_terms(integer) to authenticated;

-- -----------------------------------------------------------------------------
-- keep updated_at fresh automatically
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
drop trigger if exists trg_prefs_touch on public.user_preferences;
create trigger trg_prefs_touch before update on public.user_preferences for each row execute function public.touch_updated_at();

-- =============================================================================
-- End of schema.
-- =============================================================================
