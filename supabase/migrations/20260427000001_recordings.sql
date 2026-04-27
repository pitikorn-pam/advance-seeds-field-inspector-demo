-- Phase 7b — video recordings.
-- Recordings are orthogonal to inspections: a session may produce zero or
-- more recordings independent of inspection rows. Storing them as a
-- top-level table (rather than a child of inspections) keeps the schema
-- composable for future "record-without-capturing" workflows.

create table public.recordings (
  id uuid primary key default gen_random_uuid(),
  inspector_id uuid not null references public.profiles(id) on delete cascade,
  video_url text not null,
  duration_ms int4 not null check (duration_ms >= 0),
  captured_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);

create index recordings_inspector_idx
  on public.recordings (inspector_id, captured_at desc);

-- ============================================================================
-- RLS — same shape as inspections (D5):
--   • inspector sees + writes their own rows
--   • admin reads all
--   • only the owning inspector can delete (admins cannot)
-- ============================================================================

alter table public.recordings enable row level security;

create policy "recordings: own row select"
  on public.recordings for select
  using (inspector_id = auth.uid());

create policy "recordings: admin select all"
  on public.recordings for select
  using (public.is_admin());

create policy "recordings: own insert"
  on public.recordings for insert
  with check (inspector_id = auth.uid());

create policy "recordings: own update"
  on public.recordings for update
  using (inspector_id = auth.uid())
  with check (inspector_id = auth.uid());

create policy "recordings: own delete"
  on public.recordings for delete
  using (inspector_id = auth.uid());

-- ============================================================================
-- Storage bucket — same pattern as inspection-images: public read (URLs are
-- unguessable UUIDs) + authenticated upload + owner-only delete.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('recordings', 'recordings', true)
on conflict (id) do update set public = excluded.public;

create policy "recordings: authenticated upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'recordings');

create policy "recordings: public read"
  on storage.objects for select
  to public
  using (bucket_id = 'recordings');

create policy "recordings: owner can delete own object"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'recordings' and owner = auth.uid());
