import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import type {
  Inspection,
  Seed,
  Variety,
  CalibrationProfile,
  Profile,
  Recording,
  Notification,
  NotificationKind,
  Json,
} from "@advance-seeds/types";
import { supabase } from "./supabase";

const keys = {
  inspections: ["inspections"] as const,
  inspection: (id: string) => ["inspection", id] as const,
  varieties: ["varieties"] as const,
  calibrations: ["calibrations"] as const,
  profiles: ["profiles"] as const,
  recordings: ["recordings"] as const,
  notifications: ["notifications"] as const,
};

// ----- Notifications -----------------------------------------------------

const NOTIFICATIONS_PAGE_SIZE = 10;

export function useNotifications() {
  return useQuery({
    queryKey: keys.notifications,
    queryFn: async (): Promise<Notification[]> => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("notifications" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as Notification[];
    },
  });
}

/**
 * Page key is the cursor (created_at of the last item from the previous
 * page). Lazy-load on scroll: pass undefined for first page, the last
 * item's created_at for subsequent pages.
 */
export function useNotificationsPage(cursor: string | null) {
  return useQuery({
    queryKey: [...keys.notifications, cursor ?? "first"],
    queryFn: async (): Promise<Notification[]> => {
      let q = supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("notifications" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(NOTIFICATIONS_PAGE_SIZE);
      if (cursor) q = q.lt("created_at", cursor);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Notification[];
    },
  });
}

interface NotifyArgs {
  user_id: string;
  kind: NotificationKind;
  title: string;
  body?: string | null;
  route?: string | null;
  metadata?: Record<string, unknown> | null;
}

export function useCreateNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: NotifyArgs) => {
      const insertRow = {
        ...args,
        body: args.body ?? null,
        route: args.route ?? null,
        metadata: args.metadata ? JSON.parse(JSON.stringify(args.metadata)) : null,
      };
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("notifications" as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(insertRow as any)
        .select("*")
        .single();
      if (error || !data) throw error ?? new Error("notification insert failed");
      return data as unknown as Notification;
    },
    // Optimistic write: prepend to the local cache immediately. If the
    // server insert fails, the rollback in onError restores the cache.
    onMutate: async (args) => {
      await qc.cancelQueries({ queryKey: keys.notifications });
      const previous = qc.getQueryData<Notification[]>(keys.notifications);
      const optimistic: Notification = {
        id: `optimistic-${Date.now()}`,
        user_id: args.user_id,
        kind: args.kind,
        title: args.title,
        body: args.body ?? null,
        route: args.route ?? null,
        read_at: null,
        metadata: args.metadata ?? null,
        created_at: new Date().toISOString(),
      };
      qc.setQueryData<Notification[]>(keys.notifications, (prev) =>
        prev ? [optimistic, ...prev] : [optimistic],
      );
      return { previous };
    },
    onError: (_err, _args, ctx) => {
      if (ctx?.previous) qc.setQueryData(keys.notifications, ctx.previous);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.notifications }),
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("notifications" as any)
        .update({ read_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.notifications }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("notifications" as any)
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", userId)
        .is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.notifications }),
  });
}

export type InspectionRow = Inspection & {
  variety: { id: string; name: string; color_key: string | null } | null;
  inspector: { id: string; full_name: string | null; email: string } | null;
};

// Two projection strings:
//   • inspectionListSelect — used by useInspections() for list views (Home,
//     History). Excludes `metadata` so that list pages don't break on
//     environments where the Phase 6b.8 migration hasn't been applied.
//   • inspectionDetailSelect — used by useInspection() for the detail page
//     where the ROI badge needs `metadata`.
//
// If the metadata column is missing from the schema, useInspection still
// fails — that's the user's signal to apply the migration. Lists keep
// working in the meantime, which keeps the rest of the app navigable.
const inspectionListSelect = `
  id, inspector_id, variety_id, batch_id, calibration_id,
  image_url, captured_at, status, total_seeds,
  mean_length_mm, mean_width_mm, mean_area_mm2,
  notes, created_at,
  variety:varieties ( id, name, color_key ),
  inspector:profiles!inspections_inspector_id_fkey ( id, full_name, email )
`;
const inspectionDetailSelect = `${inspectionListSelect.replace("notes,", "notes, metadata,")}`;

export function useInspections() {
  return useQuery({
    queryKey: keys.inspections,
    queryFn: async (): Promise<InspectionRow[]> => {
      const { data, error } = await supabase
        .from("inspections")
        .select(inspectionListSelect)
        .order("captured_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as InspectionRow[];
    },
  });
}

// Paginated variant for the History screen. Cursor is the captured_at of the
// last item on the previous page (keyset pagination). Date range is pushed
// to the server so filters resolve on the first page; sync-state filters
// stay client-side because pending/failed entries live in the local queue,
// not the server table.
const HISTORY_PAGE_SIZE = 30;

export function useInspectionsPaged(filter: { start: string | null; end: string | null }) {
  return useInfiniteQuery({
    queryKey: [...keys.inspections, "paged", filter.start, filter.end] as const,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<InspectionRow[]> => {
      let q = supabase
        .from("inspections")
        .select(inspectionListSelect)
        .order("captured_at", { ascending: false })
        .limit(HISTORY_PAGE_SIZE);
      if (pageParam) q = q.lt("captured_at", pageParam);
      if (filter.start) q = q.gte("captured_at", `${filter.start}T00:00:00`);
      if (filter.end) q = q.lte("captured_at", `${filter.end}T23:59:59.999`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as InspectionRow[];
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.length < HISTORY_PAGE_SIZE) return undefined;
      return lastPage[lastPage.length - 1]?.captured_at ?? undefined;
    },
  });
}

export function useInspection(id: string | undefined) {
  return useQuery({
    queryKey: keys.inspection(id ?? ""),
    enabled: !!id,
    queryFn: async (): Promise<{ inspection: InspectionRow; seeds: Seed[] } | null> => {
      if (!id) return null;
      const [insp, seeds] = await Promise.all([
        supabase.from("inspections").select(inspectionDetailSelect).eq("id", id).single(),
        supabase.from("seeds").select("*").eq("inspection_id", id).order("index"),
      ]);
      if (insp.error) throw insp.error;
      if (seeds.error) throw seeds.error;
      return {
        inspection: insp.data as unknown as InspectionRow,
        seeds: (seeds.data ?? []) as unknown as Seed[],
      };
    },
  });
}

export function useUpdateSeedGrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { inspectionId: string; seedId: string; grade: Seed["grade"] }) => {
      const { error } = await supabase
        .from("seeds")
        .update({ grade: args.grade })
        .eq("id", args.seedId);
      if (error) throw error;
    },
    onSuccess: (_void, vars) =>
      qc.invalidateQueries({ queryKey: keys.inspection(vars.inspectionId) }),
  });
}

export function useDeleteInspection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("inspections").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.inspections }),
  });
}

export function useVarieties() {
  return useQuery({
    queryKey: keys.varieties,
    queryFn: async (): Promise<Variety[]> => {
      const { data, error } = await supabase.from("varieties").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Variety[];
    },
  });
}

type VarietyInput = Pick<
  Variety,
  "name" | "scientific_name" | "description" | "image_url" | "color_key" | "is_active"
> &
  Partial<
    Pick<Variety, "coco_class_id" | "model_class_aliases" | "ref_length_mm" | "ref_width_mm">
  > & { grade_criteria?: Json | null };
export function useUpsertVariety() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id?: string } & VarietyInput) => {
      if (id) {
        const { error } = await supabase.from("varieties").update(input).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("varieties").insert(input);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.varieties }),
  });
}

export function useDeleteVariety() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { count, error: countError } = await supabase
        .from("inspections")
        .select("id", { count: "exact", head: true })
        .eq("variety_id", id);
      if (countError) throw countError;
      if ((count ?? 0) > 0) {
        throw new Error("VARIETY_IN_USE");
      }
      const { error } = await supabase.from("varieties").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.varieties }),
  });
}

export function useCalibrations() {
  return useQuery({
    queryKey: keys.calibrations,
    queryFn: async (): Promise<CalibrationProfile[]> => {
      const { data, error } = await supabase.from("calibration_profiles").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as unknown as CalibrationProfile[];
    },
  });
}

export function useInspectors() {
  return useQuery({
    queryKey: keys.profiles,
    queryFn: async (): Promise<Pick<Profile, "id" | "full_name" | "email" | "role">[]> => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email, role");
      if (error) throw error;
      return (data ?? []) as unknown as Pick<Profile, "id" | "full_name" | "email" | "role">[];
    },
  });
}

// ----- Recordings (Phase 7b) ---------------------------------------------

export function useRecordings() {
  return useQuery({
    queryKey: keys.recordings,
    queryFn: async (): Promise<Recording[]> => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("recordings" as any)
        .select("*")
        .order("captured_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Recording[];
    },
  });
}

export function useCreateRecording() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createRecordingRemote,
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.recordings }),
  });
}

export async function createRecordingRemote(args: {
  inspector_id: string;
  video_url: string;
  duration_ms: number;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  // Stringify-roundtrip the metadata so any non-JSON-safe domain type
  // (e.g. Date) collapses to a plain object before hitting Supabase.
  const payload = {
    ...args,
    metadata: args.metadata ? JSON.parse(JSON.stringify(args.metadata)) : null,
  };
  const { data, error } = await supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("recordings" as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert(payload as any)
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("recording insert failed");
  return (data as unknown as { id: string }).id;
}

export function useDeleteRecording() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rec: Recording) => {
      const result = await deleteRecordingsRemote([rec]);
      if (result.deleted === 0) {
        throw new Error("Recording was not deleted.");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.recordings });
      qc.invalidateQueries({ queryKey: keys.inspections });
    },
  });
}

export function useDeleteRecordings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteRecordingsRemote,
    onMutate: async (rows) => {
      await qc.cancelQueries({ queryKey: keys.recordings });
      const previous = qc.getQueryData<Recording[]>(keys.recordings);
      const ids = new Set(rows.map((row) => row.id));
      qc.setQueryData<Recording[]>(keys.recordings, (current) =>
        current ? current.filter((row) => !ids.has(row.id)) : current,
      );
      return { previous };
    },
    onError: (_error, _rows, context) => {
      if (context?.previous) qc.setQueryData(keys.recordings, context.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.recordings });
      qc.invalidateQueries({ queryKey: keys.inspections });
    },
  });
}

async function deleteRecordingsRemote(
  rows: readonly Recording[],
): Promise<{ requested: number; deleted: number }> {
  if (rows.length === 0) return { requested: 0, deleted: 0 };
  await markRecordingReferencesDeleted(rows);
  // Best-effort: delete storage objects too. Failure here is logged and the row
  // deletion proceeds; orphaned objects are recoverable via bucket policy.
  const paths = rows
    .map((rec) => rec.video_url.split("/recordings/")[1])
    .filter((path): path is string => !!path);
  if (paths.length > 0) {
    const { error: objErr } = await supabase.storage.from("recordings").remove(paths);
    if (objErr) console.warn("[recordings] storage delete failed", objErr);
  }
  const ids = rows.map((rec) => rec.id);
  const { data, error } = await supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("recordings" as any)
    .delete()
    .in("id", ids)
    .select("id");
  if (error) throw error;
  return { requested: ids.length, deleted: (data ?? []).length };
}

async function markRecordingReferencesDeleted(rows: readonly Recording[]) {
  const deletedAt = new Date().toISOString();
  for (const rec of rows) {
    const { data, error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("inspections" as any)
      .select("id, metadata")
      .contains("metadata", { capture_media: { recording_id: rec.id } });
    if (error) {
      console.warn("[recordings] inspection reference lookup failed", rec.id, error);
      continue;
    }
    const inspections = (data ?? []) as unknown as Array<{ id: string; metadata: unknown }>;
    for (const inspection of inspections) {
      const metadata =
        inspection.metadata && typeof inspection.metadata === "object"
          ? { ...(inspection.metadata as Record<string, unknown>) }
          : {};
      const captureMedia =
        metadata.capture_media && typeof metadata.capture_media === "object"
          ? { ...(metadata.capture_media as Record<string, unknown>) }
          : {};
      metadata.capture_media = {
        ...captureMedia,
        kind: "video",
        recording_id: rec.id,
        url: typeof captureMedia.url === "string" ? captureMedia.url : rec.video_url,
        video_deleted_at: deletedAt,
      };
      const { error: updateError } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("inspections" as any)
        .update({ metadata })
        .eq("id", inspection.id);
      if (updateError) {
        console.warn("[recordings] inspection reference mark deleted failed", rec.id, updateError);
      }
    }
  }
}

export function useCreateInspection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createInspectionRemote,
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.inspections }),
  });
}

export async function createInspectionRemote(args: {
  inspector_id: string;
  variety_id: string;
  batch_id: string | null;
  calibration_id: string | null;
  image_url: string;
  total_seeds: number;
  mean_length_mm: number;
  mean_width_mm: number;
  mean_area_mm2: number;
  /** Optional capture-time context (Phase 6b.8). Stringify-roundtripped
   *  so domain types pass cleanly through Supabase's Json column. */
  metadata?: Record<string, unknown> | null;
  notes?: string | null;
  seeds: {
    index: number;
    length_mm: number;
    width_mm: number;
    area_mm2: number;
    grade: Seed["grade"];
    defects: Seed["defects"];
    bbox: Seed["bbox"];
  }[];
}) {
  const { seeds, metadata, ...inspection } = args;
  const insertRow = {
    ...inspection,
    status: "complete" as const,
    metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : null,
  };
  const { data, error } = await supabase
    .from("inspections")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert(insertRow as any)
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("inspection insert failed");
  // Supabase's generated `Json` union doesn't admit our domain types
  // (no index signature). Stringify-roundtrip lets us pass plain objects
  // safely without any structural mismatch at the boundary.
  const seedRows = seeds.map((s) => ({
    inspection_id: data.id,
    index: s.index,
    length_mm: s.length_mm,
    width_mm: s.width_mm,
    area_mm2: s.area_mm2,
    grade: s.grade,
    defects: JSON.parse(JSON.stringify(s.defects)),
    bbox: JSON.parse(JSON.stringify(s.bbox)),
  }));
  if (seedRows.length === 0) {
    return data.id;
  }
  const { error: seedErr } = await supabase
    .from("seeds")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert(seedRows as any);
  if (seedErr) throw seedErr;
  return data.id;
}
