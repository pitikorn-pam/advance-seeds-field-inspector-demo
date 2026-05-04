import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(fileURLToPath(import.meta.url));

for (const file of ["scan.tsx", "precise.tsx"]) {
  test(`${file} keeps Android in low-stream mode for calibration and detection`, () => {
    const source = readFileSync(join(root, file), "utf8");

    assert.match(source, /const androidFrameProcessorActive =\n\s+Platform\.OS === "android" && !busy && activeFrameProcessor !== undefined;/);
    assert.match(source, /photo: !androidFrameProcessorActive/);
    assert.match(source, /performanceProfile=\{androidFrameProcessorActive \? "low" : "quality"\}/);
  });
}
