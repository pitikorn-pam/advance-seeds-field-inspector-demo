-- Row-level security per design.md D5.
-- Roles: 'inspector' (own data only) and 'admin' (read all, write reference data).
-- Admin cannot delete other inspectors' inspections.

-- ============================================================================
-- Helpers — read role + check patterns. SECURITY DEFINER on the role lookup so
-- recursive RLS doesn't deadlock when policies on profiles consult profiles.
-- ============================================================================

create or replace function public.current_role_value()
returns public.role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role_value() = 'admin', false)
$$;

-- ============================================================================
-- profiles
-- ============================================================================

alter table public.profiles enable row level security;

create policy "profiles: read own row"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles: admin reads all"
  on public.profiles for select
  using (public.is_admin());

create policy "profiles: update own row"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- INSERT happens via the on_auth_user_created trigger; not user-initiated.
-- DELETE handled by ON DELETE CASCADE from auth.users; not user-initiated.

-- ============================================================================
-- varieties — admin-only writes; everyone reads
-- ============================================================================

alter table public.varieties enable row level security;

create policy "varieties: read all signed-in"
  on public.varieties for select
  using (auth.uid() is not null);

create policy "varieties: admin insert"
  on public.varieties for insert
  with check (public.is_admin());

create policy "varieties: admin update"
  on public.varieties for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "varieties: admin delete"
  on public.varieties for delete
  using (public.is_admin());

-- ============================================================================
-- batches — admin-only writes; everyone reads
-- ============================================================================

alter table public.batches enable row level security;

create policy "batches: read all signed-in"
  on public.batches for select
  using (auth.uid() is not null);

create policy "batches: admin insert"
  on public.batches for insert
  with check (public.is_admin());

create policy "batches: admin update"
  on public.batches for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "batches: admin delete"
  on public.batches for delete
  using (public.is_admin());

-- ============================================================================
-- calibration_profiles — read-only for the demo (no UI CRUD)
-- ============================================================================

alter table public.calibration_profiles enable row level security;

create policy "calibration: read all signed-in"
  on public.calibration_profiles for select
  using (auth.uid() is not null);

-- (No insert/update/delete policies → service_role only, via seed scripts.)

-- ============================================================================
-- inspections
--   - inspectors see + write own rows
--   - admin reads all + can update (e.g. notes), but CANNOT delete other inspectors' rows
-- ============================================================================

alter table public.inspections enable row level security;

create policy "inspections: own row select"
  on public.inspections for select
  using (inspector_id = auth.uid());

create policy "inspections: admin select all"
  on public.inspections for select
  using (public.is_admin());

create policy "inspections: own insert"
  on public.inspections for insert
  with check (inspector_id = auth.uid());

create policy "inspections: own update"
  on public.inspections for update
  using (inspector_id = auth.uid())
  with check (inspector_id = auth.uid());

create policy "inspections: admin update any"
  on public.inspections for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "inspections: own delete"
  on public.inspections for delete
  using (inspector_id = auth.uid());

-- Deliberately no admin-delete policy: admins cannot remove inspectors' work.

-- ============================================================================
-- seeds — visibility follows parent inspection
-- ============================================================================

alter table public.seeds enable row level security;

create policy "seeds: read via parent"
  on public.seeds for select
  using (
    exists (
      select 1 from public.inspections i
      where i.id = seeds.inspection_id
        and (i.inspector_id = auth.uid() or public.is_admin())
    )
  );

create policy "seeds: write via parent (inspector only)"
  on public.seeds for insert
  with check (
    exists (
      select 1 from public.inspections i
      where i.id = seeds.inspection_id
        and i.inspector_id = auth.uid()
    )
  );

create policy "seeds: update via parent (inspector only)"
  on public.seeds for update
  using (
    exists (
      select 1 from public.inspections i
      where i.id = seeds.inspection_id
        and i.inspector_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.inspections i
      where i.id = seeds.inspection_id
        and i.inspector_id = auth.uid()
    )
  );

create policy "seeds: delete via parent (inspector only)"
  on public.seeds for delete
  using (
    exists (
      select 1 from public.inspections i
      where i.id = seeds.inspection_id
        and i.inspector_id = auth.uid()
    )
  );
