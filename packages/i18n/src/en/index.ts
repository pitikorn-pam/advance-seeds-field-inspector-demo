import common from "./common.json" with { type: "json" };
import auth from "./auth.json" with { type: "json" };
import inspections from "./inspections.json" with { type: "json" };
import varieties from "./varieties.json" with { type: "json" };
import batches from "./batches.json" with { type: "json" };
import reports from "./reports.json" with { type: "json" };
import settings from "./settings.json" with { type: "json" };
import calibration from "./calibration.json" with { type: "json" };

export const en = {
  common,
  auth,
  inspections,
  varieties,
  batches,
  reports,
  settings,
  calibration,
};

export type Resources = typeof en;
