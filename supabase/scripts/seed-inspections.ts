// Creates 7 demo inspections (5 owned by Jane, 2 by Alex) with realistic
// per-seed measurements, child seeds rows, and synthetic bounding boxes.
//
// Idempotent on the demo set: identifies existing seeded rows by a stable
// `notes` prefix and re-inserts only what's missing.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { SeedGrade } from "@advance-seeds/types";
import { loadEnv } from "./_env.js";
import { gradeSeed, varietyBaselines } from "./grade-seed.js";

const SEED_TAG = "[demo-seed]";

interface SeededInspection {
  inspector_email: string;
  variety_name: string;
  batch_code: string;
  calibration_name: string;
  image_url: string;
  captured_at: string;
  total_seeds: number;
  notes: string;
}

const inspections: SeededInspection[] = [
  {
    inspector_email: "jane@advanceseeds.com",
    variety_name: "Rice — Hom Mali",
    batch_code: "BATCH-2026-04",
    calibration_name: "Default — iPhone 15 Pro LiDAR",
    image_url: "https://images.pexels.com/photos/4110251/pexels-photo-4110251.jpeg",
    captured_at: "2026-04-22T10:14:00+07:00",
    total_seeds: 18,
    notes: `${SEED_TAG} Riceberry comparison sample`,
  },
  {
    inspector_email: "jane@advanceseeds.com",
    variety_name: "Rice — Riceberry",
    batch_code: "BATCH-2026-04",
    calibration_name: "Default — iPhone 15 Pro LiDAR",
    image_url: "https://images.pexels.com/photos/4110252/pexels-photo-4110252.jpeg",
    captured_at: "2026-04-22T10:31:00+07:00",
    total_seeds: 22,
    notes: `${SEED_TAG} Drip-irrigation block A`,
  },
  {
    inspector_email: "jane@advanceseeds.com",
    variety_name: "Mung bean — KU#2",
    batch_code: "BATCH-2026-03",
    calibration_name: "ArUco card 5 cm — bench setup",
    image_url: "https://images.pexels.com/photos/4110248/pexels-photo-4110248.jpeg",
    captured_at: "2026-04-19T14:02:00+07:00",
    total_seeds: 12,
    notes: `${SEED_TAG} Smallholder cooperative sample`,
  },
  {
    inspector_email: "jane@advanceseeds.com",
    variety_name: "Soybean — Chiang Mai 60",
    batch_code: "BATCH-2026-02",
    calibration_name: "Default — iPhone 15 Pro LiDAR",
    image_url: "https://images.pexels.com/photos/4110249/pexels-photo-4110249.jpeg",
    captured_at: "2026-04-15T09:48:00+07:00",
    total_seeds: 16,
    notes: `${SEED_TAG} Dry-season trial`,
  },
  {
    inspector_email: "jane@advanceseeds.com",
    variety_name: "Corn — Sweet Hybrid",
    batch_code: "BATCH-2026-01",
    calibration_name: "Default — iPhone 15 Pro LiDAR",
    image_url: "https://images.pexels.com/photos/547263/pexels-photo-547263.jpeg",
    captured_at: "2026-04-08T11:22:00+07:00",
    total_seeds: 9,
    notes: `${SEED_TAG} Hybrid seed-purity check`,
  },
  {
    inspector_email: "alex@advanceseeds.com",
    variety_name: "Sunflower — Pacific 88",
    batch_code: "BATCH-2026-02",
    calibration_name: "ArUco card 5 cm — bench setup",
    image_url: "https://images.pexels.com/photos/4110247/pexels-photo-4110247.jpeg",
    captured_at: "2026-04-10T13:05:00+07:00",
    total_seeds: 14,
    notes: `${SEED_TAG} Oilseed QA — admin reference set`,
  },
  {
    inspector_email: "alex@advanceseeds.com",
    variety_name: "Rice — Hom Mali",
    batch_code: "BATCH-2026-04",
    calibration_name: "Default — iPhone 15 Pro LiDAR",
    image_url: "https://images.pexels.com/photos/4110251/pexels-photo-4110251.jpeg",
    captured_at: "2026-04-12T16:41:00+07:00",
    total_seeds: 24,
    notes: `${SEED_TAG} Bench-cal recalibration validation`,
  },
];

interface SeedRow {
  index: number;
  length_mm: number;
  width_mm: number;
  area_mm2: number;
  // Mirror the DB enum (now A–H + reject) rather than the legacy
  // [A,B,C,reject] literal — gradeSeed() returns the wider SeedGrade
  // type even though the seeder itself never picks letters past C.
  grade: SeedGrade;
  defects: { cracked?: boolean; discolored?: boolean };
  bbox: { x: number; y: number; width: number; height: number };
}

function rng(seed: number) {
  // Mulberry32 PRNG — deterministic per seed so reseeding the DB gives the
  // same per-seed measurements (helpful for the demo to stay consistent).
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateSeeds(insp: SeededInspection, seedSalt: number): SeedRow[] {
  const baseline = varietyBaselines[insp.variety_name] ?? { length_mm: 6, width_mm: 3 };
  const r = rng(seedSalt);
  const out: SeedRow[] = [];

  for (let i = 1; i <= insp.total_seeds; i++) {
    // Length distribution: mostly within ±10% of baseline, a few outliers.
    const lengthFactor = 0.7 + r() * 0.45; // 0.70..1.15
    const length_mm = +(baseline.length_mm * lengthFactor).toFixed(2);
    const width_mm = +(baseline.width_mm * (0.85 + r() * 0.3)).toFixed(2);
    const area_mm2 = +(length_mm * width_mm * 0.78).toFixed(2); // ~ellipse area

    const cracked = r() < 0.07;
    const discolored = r() < 0.05;
    const defects = { cracked, discolored };

    const grade = gradeSeed({ varietyName: insp.variety_name, length_mm, defects });

    // Bounding box in a synthetic 1024×768 image space.
    const x = Math.floor(80 + r() * 800);
    const y = Math.floor(80 + r() * 560);
    const w = Math.floor(20 + length_mm * 4);
    const h = Math.floor(15 + width_mm * 4);

    out.push({
      index: i,
      length_mm,
      width_mm,
      area_mm2,
      grade,
      defects,
      bbox: { x, y, width: w, height: h },
    });
  }
  return out;
}

function summary(seeds: SeedRow[]) {
  const n = seeds.length;
  if (n === 0) return { total_seeds: 0, mean_length_mm: 0, mean_width_mm: 0, mean_area_mm2: 0 };
  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  return {
    total_seeds: n,
    mean_length_mm: +(sum(seeds.map((s) => s.length_mm)) / n).toFixed(3),
    mean_width_mm: +(sum(seeds.map((s) => s.width_mm)) / n).toFixed(3),
    mean_area_mm2: +(sum(seeds.map((s) => s.area_mm2)) / n).toFixed(3),
  };
}

async function getRefIds(admin: SupabaseClient) {
  const [profiles, varieties, batches, calibrations] = await Promise.all([
    admin.from("profiles").select("id, email"),
    admin.from("varieties").select("id, name"),
    admin.from("batches").select("id, code"),
    admin.from("calibration_profiles").select("id, name"),
  ]);
  for (const r of [profiles, varieties, batches, calibrations]) {
    if (r.error) throw r.error;
  }
  return {
    profileIdByEmail: new Map(profiles.data!.map((p) => [p.email, p.id])),
    varietyIdByName: new Map(varieties.data!.map((v) => [v.name, v.id])),
    batchIdByCode: new Map(batches.data!.map((b) => [b.code, b.id])),
    calibrationIdByName: new Map(calibrations.data!.map((c) => [c.name, c.id])),
  };
}

async function main() {
  const env = loadEnv();
  const admin = createClient(env.url, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const refs = await getRefIds(admin);

  // Wipe existing demo rows (identified by SEED_TAG in notes) so this script
  // is idempotent — running it twice gives a clean replay, not duplicates.
  const { error: delErr } = await admin.from("inspections").delete().like("notes", `${SEED_TAG}%`);
  if (delErr) throw delErr;

  for (let i = 0; i < inspections.length; i++) {
    const insp = inspections[i]!;
    const inspector_id = refs.profileIdByEmail.get(insp.inspector_email);
    const variety_id = refs.varietyIdByName.get(insp.variety_name);
    const batch_id = refs.batchIdByCode.get(insp.batch_code) ?? null;
    const calibration_id = refs.calibrationIdByName.get(insp.calibration_name) ?? null;

    if (!inspector_id) throw new Error(`profile not found: ${insp.inspector_email}`);
    if (!variety_id) throw new Error(`variety not found: ${insp.variety_name}`);

    const seeds = generateSeeds(insp, 1000 + i);
    const stats = summary(seeds);

    const { data: created, error: insErr } = await admin
      .from("inspections")
      .insert({
        inspector_id,
        variety_id,
        batch_id,
        calibration_id,
        image_url: insp.image_url,
        captured_at: insp.captured_at,
        status: "complete",
        notes: insp.notes,
        ...stats,
      })
      .select("id")
      .single();
    if (insErr || !created) throw insErr ?? new Error("inspection insert failed");

    const { error: seedErr } = await admin.from("seeds").insert(
      seeds.map((s) => ({
        inspection_id: created.id,
        ...s,
      })),
    );
    if (seedErr) throw seedErr;

    console.info(
      `[inspections] ${insp.inspector_email} · ${insp.variety_name} · ${stats.total_seeds} seeds`,
    );
  }

  console.info(`[inspections] seeded ${inspections.length} rows.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
