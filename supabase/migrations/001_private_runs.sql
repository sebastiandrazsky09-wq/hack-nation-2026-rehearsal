-- Apply once to your dedicated demo project, through the Supabase SQL editor.
create table public.runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.runs enable row level security;
create policy "owners_read" on public.runs for select to authenticated using ((select auth.uid()) = owner_id);
create policy "owners_insert" on public.runs for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "owners_delete" on public.runs for delete to authenticated using ((select auth.uid()) = owner_id);
insert into storage.buckets (id, name, public, file_size_limit) values ('documents', 'documents', false, 10485760);
create policy "owner_upload" on storage.objects for insert to authenticated with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "owner_download" on storage.objects for select to authenticated using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "owner_delete_file" on storage.objects for delete to authenticated using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
