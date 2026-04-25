// Convenience: run users → inspections in order.
// Reference data (varieties, batches, calibration profiles) is seeded by
// supabase/seed.sql which `supabase db reset` and `supabase start` apply
// automatically.

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const run = (script: string) => {
  console.info(`\n=== ${script} ===`);
  execFileSync("tsx", [resolve(here, script)], { stdio: "inherit" });
};

run("seed-users.ts");
run("seed-inspections.ts");
