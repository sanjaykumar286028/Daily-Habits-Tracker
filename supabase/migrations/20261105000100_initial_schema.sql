create extension if not exists pgcrypto;

create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  record jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, id)
);

create table if not exists public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  habit_id uuid not null,
  logged_on date not null,
  status text not null check (status in ('done', 'skip')),
  value numeric not null default 0 check (value >= 0),
  reason text not null default '',
  updated_at timestamptz not null default now(),
  unique (user_id, habit_id, logged_on),
  foreign key (user_id, habit_id) references public.habits(user_id, id) on delete cascade
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  record jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, id)
);

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  record jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, entry_date)
);

create table if not exists public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_date date not null,
  duration_minutes integer not null check (duration_minutes > 0),
  record jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  record jsonb not null,
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  record jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.sync_metadata (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_synced_at timestamptz,
  device_id text,
  schema_version integer not null default 1,
  updated_at timestamptz not null default now()
);

create index if not exists habits_user_updated_idx on public.habits(user_id, updated_at);
create index if not exists habit_logs_user_date_idx on public.habit_logs(user_id, logged_on desc);
create index if not exists habit_logs_habit_date_idx on public.habit_logs(user_id, habit_id, logged_on desc);
create index if not exists goals_user_updated_idx on public.goals(user_id, updated_at);
create index if not exists journal_user_date_idx on public.journal_entries(user_id, entry_date desc);
create index if not exists focus_user_date_idx on public.focus_sessions(user_id, session_date desc);

alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;
alter table public.goals enable row level security;
alter table public.journal_entries enable row level security;
alter table public.focus_sessions enable row level security;
alter table public.achievements enable row level security;
alter table public.user_preferences enable row level security;
alter table public.sync_metadata enable row level security;

create policy "Owners can access their habits" on public.habits for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Owners can access their habit logs" on public.habit_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Owners can access their goals" on public.goals for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Owners can access their journal entries" on public.journal_entries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Owners can access their focus sessions" on public.focus_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Owners can access their achievements" on public.achievements for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Owners can access their preferences" on public.user_preferences for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Owners can access their sync metadata" on public.sync_metadata for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
