-- Allow admins to delete visible recording rows and their storage objects.
-- Inspections keep their historical thumbnail; the app marks metadata.capture_media
-- with video_deleted_at before deleting the recording row.

create policy "recordings: admin delete any"
  on public.recordings for delete
  using (public.is_admin());

create policy "recordings: admin delete any object"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'recordings' and public.is_admin());
