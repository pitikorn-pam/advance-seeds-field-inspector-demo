import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(root, "processing.tsx"), "utf8");

test("capture processing logs pilot-stage latency for slow save paths", () => {
  assert.match(source, /const PILOT_SLOW_STAGE_MS = 2500;/);
  assert.match(source, /function monitorPilotStage/);
  assert.match(source, /\[pilot-monitor\]/);
  assert.match(source, /monitorPilotStage\("photo\.upload"/);
  assert.match(source, /monitorPilotStage\("analyzer\.single-shot"/);
  assert.match(source, /monitorPilotStage\("recording\.insert"/);
});
