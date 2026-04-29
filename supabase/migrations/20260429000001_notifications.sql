-- In-app notifications for status messages, errors, and flow milestones.
-- Server-side persistence so they survive app uninstall and sync across
-- devices a user signs into. Client-side optimistic writes via React
-- Query make them feel instant.

create type public.notification_kind as enum ('success', 'info', 'warning', 'error');

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind public.notification_kind not null default 'info',
  title text not null,
  body text,
  /** Optional deep-link route (e.g. /inspections/<id>) used by the modal
      to push the user into context when they tap a notification. */
  route text,
  /** When non-null, the notification is "read"; UI hides the unread badge. */
  read_at timestamptz,
  /** JSONB metadata for future per-kind context (related ids, counts, etc).
      Constrained to objects so callers can rely on dotted-key extraction. */
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index notifications_user_recent_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications
  add constraint notifications_metadata_object_check
  check (metadata is null or jsonb_typeof(metadata) = 'object');

-- ============================================================================
-- RLS — users see + manage their own notifications. No admin override:
-- notifications are personal context, not shared records.
-- ============================================================================

alter table public.notifications enable row level security;

create policy "notifications: own row select"
  on public.notifications for select
  using (user_id = auth.uid());

create policy "notifications: own insert"
  on public.notifications for insert
  with check (user_id = auth.uid());

create policy "notifications: own update"
  on public.notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "notifications: own delete"
  on public.notifications for delete
  using (user_id = auth.uid());
