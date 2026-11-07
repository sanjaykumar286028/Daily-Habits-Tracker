-- The app merges records on each device, but concurrent devices can still
-- submit an older snapshot after a newer write. Keep the latest record or
-- tombstone when PostgREST resolves the upsert conflict.
create or replace function public.keep_newest_user_sync_record()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.updated_at > new.updated_at then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists user_sync_records_keep_newest on public.user_sync_records;
create trigger user_sync_records_keep_newest
before update on public.user_sync_records
for each row execute function public.keep_newest_user_sync_record();
