// Centralized data hooks. Keep all Supabase calls here so route components
// stay thin and hooks can be swapped/mocked later.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  Inspection,
  Seed,
  Variety,
  Batch,
  CalibrationProfile,
  Profile,
} from "@advance-seeds/types";
import { supabase } from "./supabase";

const keys = {
  inspections: ["inspections"] as const,
  inspection: (id: string) => ["inspection", id] as const,
  varieties: ["varieties"] as const,
  batches: ["batches"] as const,
  calibrations: ["calibrations"] as const,
  profiles: ["profiles"] as const,
};

type InspectionRow = Inspection & {
  variety: { id: string; name: string; color_key: string | null } | null;
  batch: { id: string; code: string } | null;
  inspector: { id: string; full_name: string | null; email: string } | null;
};

const inspectionSelect = `
  id, inspector_id, variety_id, batch_id, calibration_id,
  image_url, captured_at, status, total_seeds,
  mean_length_mm, mean_width_mm, mean_area_mm2,
  notes, created_at,
  variety:varieties ( id, name, color_key ),
  batch:batches ( id, code ),
  inspector:profiles!inspections_inspector_id_fkey ( id, full_name, email )
`;

export function useInspections() {
  return useQuery({
    queryKey: keys.inspections,
    queryFn: async (): Promise<InspectionRow[]> => {
      const { data, error } = await supabase
        .from("inspections")
        .select(inspectionSelect)
        .order("captured_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as InspectionRow[];
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
        supabase.from("inspections").select(inspectionSelect).eq("id", id).single(),
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

export function useUpdateInspectionNotes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const { error } = await supabase.from("inspections").update({ notes }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      void qc.invalidateQueries({ queryKey: keys.inspection(vars.id) });
      void qc.invalidateQueries({ queryKey: keys.inspections });
    },
  });
}

// ---- varieties ----
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
  "name" | "scientific_name" | "description" | "image_url" | "color_key"
>;

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
      const { error } = await supabase.from("varieties").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.varieties }),
  });
}

// ---- batches ----
export function useBatches() {
  return useQuery({
    queryKey: keys.batches,
    queryFn: async (): Promise<Batch[]> => {
      const { data, error } = await supabase.from("batches").select("*").order("code");
      if (error) throw error;
      return (data ?? []) as unknown as Batch[];
    },
  });
}

type BatchInput = Pick<Batch, "code" | "location" | "sown_at" | "notes">;

export function useUpsertBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id?: string } & BatchInput) => {
      if (id) {
        const { error } = await supabase.from("batches").update(input).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("batches").insert(input);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.batches }),
  });
}

export function useDeleteBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("batches").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.batches }),
  });
}

// ---- calibration ----
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

// ---- profiles (for inspector filter) ----
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

export type { InspectionRow };
