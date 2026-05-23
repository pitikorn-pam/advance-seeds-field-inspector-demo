import common from "./common.json" with { type: "json" };
import auth from "./auth.json" with { type: "json" };
import inspections from "./inspections.json" with { type: "json" };
import varieties from "./varieties.json" with { type: "json" };
import reports from "./reports.json" with { type: "json" };
import settings from "./settings.json" with { type: "json" };
import calibration from "./calibration.json" with { type: "json" };
import onboarding from "./onboarding.json" with { type: "json" };
import profile from "./profile.json" with { type: "json" };
import more from "./more.json" with { type: "json" };
import library from "./library.json" with { type: "json" };
import history from "./history.json" with { type: "json" };
import notifications from "./notifications.json" with { type: "json" };

export const en = {
  common,
  auth,
  inspections,
  varieties,
  reports,
  settings,
  calibration,
  onboarding,
  profile,
  more,
  library,
  history,
  notifications,
};

export type Resources = typeof en;
