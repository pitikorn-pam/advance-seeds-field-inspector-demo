-- Storage bucket for inspection images.
-- Public-read per design.md "Resolved Decisions §4" — object keys are unguessable
-- UUIDs and RLS still gates the database rows that reference these images.

insert into storage.buckets (id, name, public)
values ('inspection-images', 'inspection-images', true)
on conflict (id) do update set public = excluded.public;

-- Authenticated users can upload to the bucket; anyone can read.
create policy "inspection-images: authenticated upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'inspection-images');

create policy "inspection-images: public read"
  on storage.objects for select
  to public
  using (bucket_id = 'inspection-images');

create policy "inspection-images: owner can delete own object"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'inspection-images' and owner = auth.uid());
