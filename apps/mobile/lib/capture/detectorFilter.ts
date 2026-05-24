import type { DetectorFilterMode } from "@/lib/capture/session";

export interface DetectorFilterState {
  mode: DetectorFilterMode;
  classNames: readonly string[];
}

export interface ResolvedDetectorFilter {
  mode: DetectorFilterMode;
  classNames: readonly string[];
  classIds: readonly number[];
  classFilter: readonly number[] | null;
  varietyNames: readonly string[] | null;
  modelClassAliases: readonly string[] | null;
}

export function resolveDetectorFilter(
  filter: DetectorFilterState,
  activeModelClassNames: readonly string[] | null | undefined,
): ResolvedDetectorFilter {
  if (filter.mode !== "classes" || filter.classNames.length === 0) {
    return {
      mode: "all",
      classNames: [],
      classIds: [],
      classFilter: null,
      varietyNames: null,
      modelClassAliases: null,
    };
  }

  const modelNames = activeModelClassNames ?? [];
  const selected = Array.from(new Set(filter.classNames.filter((name) => name.trim().length > 0)));
  const classIds = selected.map((name) => modelNames.indexOf(name)).filter((idx) => idx >= 0);

  return {
    mode: "classes",
    classNames: selected,
    classIds,
    classFilter: classIds.length > 0 ? classIds : null,
    varietyNames: selected,
    modelClassAliases: selected,
  };
}

export function classNameForSeed(
  classId: number | null | undefined,
  activeModelClassNames: readonly string[] | null | undefined,
): string | null {
  if (typeof classId !== "number") return null;
  return activeModelClassNames?.[classId] ?? null;
}

export function buildClassBreakdown(
  seeds: readonly { class_id?: number | null; class_name?: string | null }[],
  activeModelClassNames: readonly string[] | null | undefined,
): Array<{ class_id: number | null; class_name: string; count: number }> {
  const counts = new Map<string, { class_id: number | null; class_name: string; count: number }>();
  for (const seed of seeds) {
    const classId = typeof seed.class_id === "number" ? seed.class_id : null;
    const className =
      seed.class_name ??
      (typeof seed.class_id === "number" ? activeModelClassNames?.[seed.class_id] : null) ??
      "unknown";
    const key = `${classId ?? "null"}:${className}`;
    const current = counts.get(key);
    if (current) {
      current.count += 1;
    } else {
      counts.set(key, { class_id: classId, class_name: className, count: 1 });
    }
  }
  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.class_name.localeCompare(b.class_name),
  );
}
