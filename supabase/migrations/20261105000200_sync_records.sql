create table if not exists public.user_sync_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  collection text not null check (collection in ('habits', 'logs', 'goals', 'journal', 'focus', 'achievements', 'preferences')),
  record_id text not null check (char_length(record_id) between 1 and 128),
  record jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, collection, record_id)
);

create index if not exists user_sync_records_user_updated_idx
  on public.user_sync_records (user_id, updated_at);

revoke all on table public.user_sync_records from public, anon, authenticated;
grant select, insert, update, delete on table public.user_sync_records to authenticated;

alter table public.user_sync_records enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_sync_records'
      and policyname = 'Users can access only their own sync records'
  ) then
    create policy "Users can access only their own sync records"
      on public.user_sync_records
      for all to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end
$$;
