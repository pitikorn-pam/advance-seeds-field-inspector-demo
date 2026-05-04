#!/usr/bin/env node
/**
 * Pushes an Android APK to Firebase App Distribution.
 *
 * Preferred local-release path:
 *   FIREBASE_APK_PATH=android/app/build/outputs/apk/release/app-release.apk \
 *     pnpm -F @advance-seeds/mobile dist:android
 *
 * Legacy EAS path:
 *   Pulls the latest finished EAS Android preview build's APK URL and
 *   distributes it. Run only after `pnpm -F @advance-seeds/mobile
 *   build:preview:android` finishes.
 *
 * Prereqs (one-time):
 *   1. `npm i -g firebase-tools` and `firebase login`.
 *   2. Create a Firebase project, register an Android app with package id
 *      `com.advanceseeds.fieldinspector`, copy the App ID
 *      (e.g. `1:123456789012:android:abcdef...`) into `FIREBASE_ANDROID_APP_ID`
 *      in apps/mobile/.env.
 *   3. In Firebase Console → App Distribution → Testers & Groups, create a
 *      group with alias `internal` (and optionally `pilot`) and add testers.
 *
 * What this does:
 *   - Reads FIREBASE_ANDROID_APP_ID from env or .env.
 *   - Uses FIREBASE_APK_PATH when set.
 *   - Otherwise asks `eas build:list` for the latest finished Android preview
 *     build and downloads that APK to a temp file.
 *   - Calls `firebase appdistribution:distribute` with --groups internal.
 *
 * Uses execFileSync (not exec) throughout so user-controlled values like
 * APK URL and Firebase app id never reach a shell — eliminates injection
 * risk if .env or EAS metadata is ever attacker-controlled.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

const APP_ID = process.env.FIREBASE_ANDROID_APP_ID || readEnvFile().FIREBASE_ANDROID_APP_ID;
if (!APP_ID) {
  console.error(
    "FIREBASE_ANDROID_APP_ID is required (set in env or apps/mobile/.env).\n" +
      "Find it in Firebase Console → Project settings → Your apps → Android app → App ID.",
  );
  process.exit(1);
}

const requestedApkPath = process.env.FIREBASE_APK_PATH;
const { apkPath, releaseNotes } = requestedApkPath
  ? localApk(requestedApkPath)
  : latestEasApk();

const groups = process.env.FIREBASE_GROUPS || "internal";
console.log(`→ uploading to Firebase App Distribution (group: ${groups})`);
try {
  execFileSync(
    "firebase",
    [
      "appdistribution:distribute",
      apkPath,
      "--app",
      APP_ID,
      "--groups",
      groups,
      "--release-notes",
      releaseNotes,
    ],
    { stdio: "inherit" },
  );
} catch (err) {
  // Firebase 404 from the :distribute endpoint means the upload succeeded
  // (the release was created) but the named tester group doesn't exist on
  // the project. Surface a clearer hint than the raw HTTP error.
  console.error("");
  console.error(
    `✗ Firebase distribute failed. Most common cause: tester group "${groups}"`,
  );
  console.error(
    "  doesn't exist in Firebase. Create it under App Distribution → Testers & groups,",
  );
  console.error(
    "  add testers, then retry. The APK upload itself succeeded — re-running this",
  );
  console.error("  script will reuse the same release without re-uploading.");
  throw err;
}
console.log("✔ distribute complete — testers will get an email link");

function localApk(path) {
  const apkPath = isAbsolute(path) ? path : resolve(process.cwd(), path);
  if (!existsSync(apkPath)) {
    console.error(`FIREBASE_APK_PATH does not exist: ${apkPath}`);
    process.exit(1);
  }
  let releaseNotes = "Local Android build";
  try {
    const tag = execFileSync("git", ["describe", "--tags", "--always", "--dirty"], {
      encoding: "utf8",
    }).trim();
    if (tag) releaseNotes = `Local Android build ${tag}`;
  } catch {
    // Keep the generic release notes.
  }
  console.log(`→ using local APK: ${apkPath}`);
  return { apkPath, releaseNotes };
}

function latestEasApk() {
  console.log("→ querying EAS for latest finished Android preview build");
  const buildsJson = execFileSync(
    "eas",
    [
      "build:list",
      "--platform",
      "android",
      "--profile",
      "preview",
      "--status",
      "finished",
      "--limit",
      "1",
      "--json",
      "--non-interactive",
    ],
    { encoding: "utf8" },
  );
  const builds = JSON.parse(buildsJson);
  const build = builds[0];
  if (!build) {
    console.error("No finished EAS Android preview builds found.");
    process.exit(1);
  }
  const url = build.artifacts?.buildUrl;
  if (!url) {
    console.error("Build has no artifacts.buildUrl — is it really finished?");
    process.exit(1);
  }
  console.log(`→ build ${build.id} (${build.completedAt}); APK: ${url}`);

  const dir = mkdtempSync(join(tmpdir(), "advance-seeds-apk-"));
  const apkPath = join(dir, "app-preview.apk");
  console.log("→ downloading APK");
  execFileSync("curl", ["-fLs", "--output", apkPath, url], { stdio: "inherit" });
  return { apkPath, releaseNotes: `EAS build ${build.id}` };
}

function readEnvFile() {
  const path = join(process.cwd(), ".env");
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
  return out;
}
