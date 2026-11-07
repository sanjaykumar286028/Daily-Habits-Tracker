-- Data API grants and RLS are separate controls. Keep client roles limited to
-- owner-filtered CRUD; in particular, authenticated must not retain TRUNCATE.
revoke all on table
  public.habits,
  public.habit_logs,
  public.goals,
  public.journal_entries,
  public.focus_sessions,
  public.achievements,
  public.user_preferences,
  public.sync_metadata,
  public.user_sync_records
from public, anon, authenticated;

grant select, insert, update, delete on table
  public.habits,
  public.habit_logs,
  public.goals,
  public.journal_entries,
  public.focus_sessions,
  public.achievements,
  public.user_preferences,
  public.sync_metadata,
  public.user_sync_records
to authenticated;

alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;
alter table public.goals enable row level security;
alter table public.journal_entries enable row level security;
alter table public.focus_sessions enable row level security;
alter table public.achievements enable row level security;
alter table public.user_preferences enable row level security;
alter table public.sync_metadata enable row level security;
alter table public.user_sync_records enable row level security;

drop policy if exists "Owners can access their habits" on public.habits;
create policy "Owners can access their habits" on public.habits
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Owners can access their habit logs" on public.habit_logs;
create policy "Owners can access their habit logs" on public.habit_logs
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Owners can access their goals" on public.goals;
create policy "Owners can access their goals" on public.goals
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Owners can access their journal entries" on public.journal_entries;
create policy "Owners can access their journal entries" on public.journal_entries
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Owners can access their focus sessions" on public.focus_sessions;
create policy "Owners can access their focus sessions" on public.focus_sessions
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Owners can access their achievements" on public.achievements;
create policy "Owners can access their achievements" on public.achievements
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Owners can access their preferences" on public.user_preferences;
create policy "Owners can access their preferences" on public.user_preferences
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Owners can access their sync metadata" on public.sync_metadata;
create policy "Owners can access their sync metadata" on public.sync_metadata
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users can access only their own sync records" on public.user_sync_records;
create policy "Users can access only their own sync records" on public.user_sync_records
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
