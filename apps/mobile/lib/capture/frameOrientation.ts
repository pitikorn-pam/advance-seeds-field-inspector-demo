export type CanonicalFrameOrientation =
  | "up"
  | "down"
  | "left"
  | "right"
  | "up-mirrored"
  | "down-mirrored"
  | "left-mirrored"
  | "right-mirrored";

export function normalizeFrameOrientation(orientation: string | null | undefined): string {
  const value = (orientation ?? "up").toLowerCase().replace(/_/g, "-");
  const mirrored = value.endsWith("-mirrored") ? "-mirrored" : "";
  const base = mirrored ? value.slice(0, -"-mirrored".length) : value;
  switch (base) {
    case "portrait":
    case "portrait-up":
    case "up":
      return `up${mirrored}`;
    case "portrait-down":
    case "portrait-upside-down":
    case "upside-down":
    case "down":
      return `down${mirrored}`;
    case "landscape-left":
    case "left":
      return `left${mirrored}`;
    case "landscape-right":
    case "right":
      return `right${mirrored}`;
    default:
      return value || "up";
  }
}
