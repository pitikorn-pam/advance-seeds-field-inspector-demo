import type { ModelMetadata } from "./types";

export function validateModelMetadata(metadata: ModelMetadata): string[] {
  const errors: string[] = [];
  if (metadata.task !== "instance-segmentation") errors.push("task must be instance-segmentation");
  if (!/^yolo26[ns]-seg$/.test(metadata.model_name)) {
    errors.push("model_name must be yolo26n-seg or yolo26s-seg");
  }
  if (metadata.input_size !== 640) errors.push("input_size must be 640");
  if (metadata.output_kind !== "segmentation") errors.push("output_kind must be segmentation");
  if (metadata.calibration?.required !== true) errors.push("calibration.required must be true");
  // class_names: any non-empty array of unique strings is accepted. The
  // variety editor's `model_class_aliases` binding lets operators map
  // varieties onto whatever classes the model exposes, so the registry
  // no longer needs a fixed 6-class contract.
  if (!Array.isArray(metadata.class_names) || metadata.class_names.length === 0) {
    errors.push("class_names must be a non-empty array of strings");
  } else {
    const allStrings = metadata.class_names.every(
      (n): n is string => typeof n === "string" && n.length > 0,
    );
    if (!allStrings) {
      errors.push("class_names must contain only non-empty strings");
    } else if (new Set(metadata.class_names).size !== metadata.class_names.length) {
      errors.push("class_names must not contain duplicates");
    }
  }
  // output_shape must start with [1, 300, N]. The trailing channel count
  // varies by export format:
  //   • NMS-fused (Ultralytics `nms=True`): N = 4 + 1 (conf) + 1 (cls) + 32 (masks) = 38, regardless of class count
  //   • Raw (no NMS): N = 4 + numClasses + 32, e.g. 38 for 1-class, 42 for 6-class
  // We accept either layout — both produce per-detection rows the JS
  // decoder can interpret. Lower bound 37 covers the 1-class raw case.
  if (
    !Array.isArray(metadata.output_shape) ||
    metadata.output_shape.length < 3 ||
    metadata.output_shape[0] !== 1 ||
    metadata.output_shape[1] !== 300 ||
    metadata.output_shape[2] < 37
  ) {
    errors.push("output_shape must start with [1,300,N] where N ≥ 37");
  } else if (Array.isArray(metadata.class_names) && metadata.class_names.length > 0) {
    const channels = metadata.output_shape[2];
    const nmsExpected = 4 + 1 + 1 + 32; // 38
    const rawExpected = 4 + metadata.class_names.length + 32;
    if (channels !== nmsExpected && channels !== rawExpected) {
      errors.push(
        `output_shape[2] (${channels}) must equal ${nmsExpected} (NMS-fused) or ${rawExpected} (raw, ${metadata.class_names.length} classes)`,
      );
    }
  }
  return errors;
}

export function mapClassFilterForModel(
  classFilter: readonly number[] | null | undefined,
  metadata: ModelMetadata | null | undefined,
  varietyNames?: readonly string[] | null,
  modelClassAliases?: readonly string[] | null,
): number[] | null {
  // Bundled COCO model: pass the COCO ids straight through.
  if (!metadata || metadata.output_kind !== "segmentation") {
    if (!classFilter || classFilter.length === 0) return null;
    return [...classFilter];
  }
  const names = metadata.class_names;
  if (!Array.isArray(names) || names.length === 0) return null;

  const mapped = new Set<number>();

  // Tier 1 — explicit aliases. The variety editor saved class names
  // chosen from the active model's class_names. Exact match wins over
  // anything else because it's operator-curated.
  if (modelClassAliases && modelClassAliases.length > 0) {
    for (const alias of modelClassAliases) {
      const idx = names.indexOf(alias);
      if (idx >= 0) mapped.add(idx);
    }
  }

  // Tier 2 — name substring. For varieties without explicit aliases,
  // best-effort match the variety display name against the model
  // class_names (e.g. "Banana" → ["banana", "banana_spot"]).
  if (mapped.size === 0 && varietyNames && varietyNames.length > 0) {
    for (const variety of varietyNames) {
      const needle = variety.trim().toLowerCase();
      if (!needle) continue;
      names.forEach((cls, idx) => {
        if (cls.toLowerCase().includes(needle)) mapped.add(idx);
      });
    }
  }

  // Tier 3 — COCO synonym fallback. Legacy varieties tagged only with
  // a COCO id, mapped to canonical seg-model class names.
  if (mapped.size === 0 && classFilter) {
    for (const id of classFilter) {
      const synonyms = COCO_TO_MODEL_NAMES[id];
      if (!synonyms) continue;
      for (const name of synonyms) {
        const idx = names.indexOf(name);
        if (idx >= 0) mapped.add(idx);
      }
    }
  }

  return mapped.size > 0 ? [...mapped] : null;
}

const COCO_TO_MODEL_NAMES: Record<number, string[]> = {
  46: ["banana", "banana_spot"],
  47: ["apple", "apple_spot"],
  49: ["orange", "orange_spot"],
};
