-- Run once in the Supabase SQL Editor for the existing diary-main project.
-- Private photo bucket; objects are immutable and owned by the signed-in user.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('diary-photos','diary-photos',false,52428800,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public=false, file_size_limit=52428800, allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "Diary photos read own" on storage.objects;
create policy "Diary photos read own" on storage.objects for select to authenticated
using (bucket_id='diary-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Diary photos create own" on storage.objects;
create policy "Diary photos create own" on storage.objects for insert to authenticated
with check (bucket_id='diary-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
-- No update or delete policy. Uploaded photo versions remain immutable.
