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
): number[] | null {
  if (!classFilter || classFilter.length === 0) return null;
  if (!metadata || metadata.output_kind !== "segmentation") return [...classFilter];
  const names = metadata.class_names;
  const mapped = new Set<number>();
  for (const id of classFilter) {
    const namesForCoco =
      id === 46
        ? ["banana", "banana_spot"]
        : id === 47
          ? ["apple", "apple_spot"]
          : id === 49
            ? ["orange", "orange_spot"]
            : [];
    for (const name of namesForCoco) {
      const idx = names.indexOf(name);
      if (idx >= 0) mapped.add(idx);
    }
  }
  return mapped.size > 0 ? [...mapped] : null;
}
