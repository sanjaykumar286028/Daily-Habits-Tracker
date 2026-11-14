-- Add task records to the existing per-user sync table without touching data.
-- RLS and grants are unchanged; all rows remain scoped to auth.uid().
alter table public.user_sync_records
  drop constraint if exists user_sync_records_collection_check;

alter table public.user_sync_records
  add constraint user_sync_records_collection_check
  check (collection in ('habits', 'logs', 'tasks', 'goals', 'journal', 'focus', 'achievements', 'preferences'));

