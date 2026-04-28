// Domain types — single source of truth for shape across web + mobile.
// Mirrors supabase/migrations/* once those exist; fields stay aligned by hand
// until packages/types/src/supabase.gen.ts is generated, after which these
// types should re-export Row aliases from there for the DB shape and keep
// only UI-only fields hand-defined.

export type Role = "inspector" | "admin";

export type Locale = "en" | "th";

export type Theme = "light" | "dark" | "system";

export type CalibrationSource = "lidar" | "aruco";

export type InspectionStatus = "pending" | "analyzing" | "complete" | "failed";

export type SeedGrade = "A" | "B" | "C" | "reject";

// ----- Reference data ----------------------------------------------------

export interface Variety {
  id: string;
  name: string;
  scientific_name: string | null;
  description: string | null;
  image_url: string | null;
  /** corn | rice | legume | mungbean — used for thumb tinting from design tokens */
  color_key: string | null;
  created_by: string;
  created_at: string;
}

export interface Batch {
  id: string;
  code: string;
  location: string | null;
  sown_at: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
}

export interface CalibrationProfile {
  id: string;
  name: string;
  px_per_mm: number;
  source: CalibrationSource;
  created_at: string;
}

// ----- People -----------------------------------------------------------

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  locale: Locale;
}

// ----- Inspections + per-seed measurements -------------------------------

export interface BoundingBox {
  /** Pixel-space, top-left origin. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SeedDefects {
  cracked?: boolean;
  discolored?: boolean;
  /** Reserved for future extension via JSONB. */
  [key: string]: boolean | number | string | undefined;
}

export interface Seed {
  id: string;
  inspection_id: string;
  /** 1-based ordinal within the inspection (used in UI as the seed number). */
  index: number;
  length_mm: number;
  width_mm: number;
  area_mm2: number;
  grade: SeedGrade;
  defects: SeedDefects;
  bbox: BoundingBox;
}

/**
 * Capture-time context attached to an inspection. Open-ended bag — keys
 * documented here as they're added; the DB-level constraint just verifies
 * the column is a JSON object (or null).
 */
export interface InspectionMetadata {
  /**
   * Active region of interest at the moment the user pressed Save. The
   * shape is normalized to the viewfinder's [0..1] coords (rect/poly use
   * x/y/w/h or vertex points; circle uses cx/cy + radius normalized to
   * min-dimension). Mirrors the `Roi` discriminated union in
   * apps/mobile/lib/capture/roi.ts.
   */
  roi?: unknown;
  /** Reserved for Phase 5 LiveCalibrator output captured at shutter. */
  calibration?: unknown;
  /** Reserved for Phase 4 — TFLite or CoreML model identifier. */
  analyzer_id?: string;
  [key: string]: unknown;
}

export interface Inspection {
  id: string;
  inspector_id: string;
  variety_id: string;
  batch_id: string | null;
  calibration_id: string | null;
  image_url: string;
  captured_at: string;
  status: InspectionStatus;
  total_seeds: number;
  mean_length_mm: number | null;
  mean_width_mm: number | null;
  mean_area_mm2: number | null;
  notes: string | null;
  metadata: InspectionMetadata | null;
  created_at: string;
}

/** Inspection with its child seeds and joined reference rows — what list/detail screens render. */
export interface InspectionWithDetail extends Inspection {
  variety: Pick<Variety, "id" | "name" | "color_key">;
  batch: Pick<Batch, "id" | "code"> | null;
  calibration: Pick<CalibrationProfile, "id" | "name" | "px_per_mm" | "source"> | null;
  inspector: Pick<Profile, "id" | "full_name" | "email">;
  seeds: Seed[];
}

// ----- Recordings (Phase 7b) ---------------------------------------------
// Orthogonal to inspections: a session may produce zero or more recordings
// independent of any inspection row. video_url is the public Supabase
// Storage URL; duration_ms is captured client-side from the recording API.

export interface Recording {
  id: string;
  inspector_id: string;
  video_url: string;
  duration_ms: number;
  captured_at: string;
  notes: string | null;
  created_at: string;
}
