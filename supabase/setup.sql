-- Safe to rerun. Keeps all existing diary data.
begin;
create table if not exists public.diary_sync (
  user_id uuid primary key references auth.users(id),
  data jsonb not null default '{}'::jsonb,
  version bigint not null default 1
);
alter table public.diary_sync enable row level security;
revoke all on public.diary_sync from anon, authenticated;
grant select, insert, update, delete on public.diary_sync to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='diary_sync' and policyname='Read own diary') then
    create policy "Read own diary" on public.diary_sync for select to authenticated using ((select auth.uid())=user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='diary_sync' and policyname='Create own diary') then
    create policy "Create own diary" on public.diary_sync for insert to authenticated with check ((select auth.uid())=user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='diary_sync' and policyname='Update own diary') then
    create policy "Update own diary" on public.diary_sync for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='diary_sync' and policyname='Delete own diary') then
    create policy "Delete own diary" on public.diary_sync for delete to authenticated using ((select auth.uid())=user_id);
  end if;
end $$;
commit;
