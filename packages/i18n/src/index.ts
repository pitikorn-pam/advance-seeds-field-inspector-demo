// Aggregated resources for both apps. Apps wire these into i18next:
//
//   import { resources, defaultLocale, supportedLocales } from "@advance-seeds/i18n";
//   i18next.init({ resources, lng: defaultLocale, fallbackLng: defaultLocale });
//
// Namespace list is stable; adding a new namespace requires updating both en/
// and th/ JSON files plus this index.

import { en } from "./en/index.js";
import { th } from "./th/index.js";

export const supportedLocales = ["en", "th"] as const;
export type SupportedLocale = (typeof supportedLocales)[number];

export const defaultLocale: SupportedLocale = "en";

export const namespaces = [
  "common",
  "auth",
  "inspections",
  "varieties",
  "batches",
  "reports",
  "settings",
  "calibration",
  "onboarding",
  "profile",
  "more",
  "home",
] as const;
export type Namespace = (typeof namespaces)[number];

/** i18next-shaped resources object. */
export const resources = {
  en,
  th,
} as const;

export { en } from "./en/index.js";
export { th } from "./th/index.js";
export type { Resources } from "./en/index.js";
