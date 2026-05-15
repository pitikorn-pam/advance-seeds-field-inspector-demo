// Shared string utilities for compact rendering of long opaque identifiers
// (SHA-256 hashes, version IDs) and JSON primitive coercion.

export function truncateMiddle(s: string, head = 8, tail = 4): string {
  if (s.length <= head + tail + 1) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

// Format a JSON-ish primitive for display. Integers stay bare; floats trim
// trailing zeros after a 4-decimal expansion; bools/strings pass through;
// arrays collapse to a comma-joined truncation; everything else stringifies.
export function formatPrimitive(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "—";
    return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/\.?0+$/, "");
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.slice(0, 4).map(formatPrimitive).join(", ");
  return JSON.stringify(value);
}
