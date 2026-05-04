import type { ModelMetadata } from "./types";

const REQUIRED_CLASSES = ["apple", "apple_spot", "banana", "banana_spot", "orange", "orange_spot"];

export function validateModelMetadata(metadata: ModelMetadata): string[] {
  const errors: string[] = [];
  if (metadata.task !== "instance-segmentation") errors.push("task must be instance-segmentation");
  if (!/^yolo26[ns]-seg$/.test(metadata.model_name)) {
    errors.push("model_name must be yolo26n-seg or yolo26s-seg");
  }
  if (metadata.input_size !== 640) errors.push("input_size must be 640");
  if (metadata.output_kind !== "segmentation") errors.push("output_kind must be segmentation");
  if (metadata.calibration?.required !== true) errors.push("calibration.required must be true");
  if (JSON.stringify(metadata.class_names) !== JSON.stringify(REQUIRED_CLASSES)) {
    errors.push("class_names must match the Advance Seeds segmentation contract");
  }
  if (
    !Array.isArray(metadata.output_shape) ||
    metadata.output_shape.length < 3 ||
    metadata.output_shape[0] !== 1 ||
    metadata.output_shape[1] !== 300 ||
    metadata.output_shape[2] < 38
  ) {
    errors.push("output_shape must start with [1,300,38]");
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

  // Tier 4 — pass-through of the original COCO ids. Some custom-trained
  // models (especially fine-tunes from COCO weights via Ultralytics)
  // preserve the original COCO class IDs in their post-NMS output even
  // when the metadata declares a custom 6-class set. e.g. our model
  // emits cls=46 for banana, cls=52 for banana_spot, despite class_names
  // saying ["apple", "apple_spot", "banana", "banana_spot", ...]. Adding
  // the COCO ids as additional accepted classes lets these detections
  // through; they'll be displayed against the variety's expected name
  // even if the model's internal label doesn't match the metadata index.
  if (classFilter) {
    for (const id of classFilter) mapped.add(id);
  }

  return mapped.size > 0 ? [...mapped] : null;
}

const COCO_TO_MODEL_NAMES: Record<number, string[]> = {
  46: ["banana", "banana_spot"],
  47: ["apple", "apple_spot"],
  49: ["orange", "orange_spot"],
};
