import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(fileURLToPath(import.meta.url));

for (const file of ["scan.tsx", "precise.tsx"]) {
  test(`${file} keeps Android in low-stream mode for calibration and detection`, () => {
    const source = readFileSync(join(root, file), "utf8");

    assert.match(
      source,
      /const androidFrameProcessorActive =\s+Platform\.OS === "android" &&\s+!busy &&\s+!modelInstallInProgress &&\s+activeFrameProcessor !== undefined;/s,
    );
    assert.match(source, /photo: !androidFrameProcessorActive/);
    assert.match(source, /performanceProfile=\{androidFrameProcessorActive \? "low" : "quality"\}/);
  });

  test(`${file} falls back from stalled LiDAR gating to live ArUco calibration`, () => {
    const source = readFileSync(join(root, file), "utf8");

    assert.match(source, /const LIDAR_ARUCO_FALLBACK_DELAY_MS = 1600;/);
    assert.match(
      source,
      /const \[lidarArucoFallbackReady, setLidarArucoFallbackReady\] = useState\(false\);/,
    );
    assert.match(source, /const shouldScanAruco =/);
    assert.match(
      source,
      /liveLidar\.supported === false \|\|\s+lidarArucoFallbackReady \|\|\s+manualCalibration\.reading !== null/s,
    );
    assert.match(source, /!lidarArucoFallbackReady/);
    assert.match(
      source,
      /setTimeout\(\s*\(\) => setLidarArucoFallbackReady\(true\),\s*LIDAR_ARUCO_FALLBACK_DELAY_MS\s*\)/s,
    );
  });

  test(`${file} gives live ArUco the frame processor until calibration locks`, () => {
    const source = readFileSync(join(root, file), "utf8");

    assert.match(
      source,
      /const arucoFrameProcessor =\s+shouldScanAruco && !liveAruco\.locked \? liveAruco\.frameProcessor : undefined;/s,
    );
    assert.match(
      source,
      /:\s+\(arucoFrameProcessor \?\? liveDetections\.frameProcessor\);/s,
    );
  });
}
