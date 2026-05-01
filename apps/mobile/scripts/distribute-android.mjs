#!/usr/bin/env node
/**
 * Pulls the latest finished EAS Android preview build's APK URL and pushes it
 * to Firebase App Distribution. Run after `pnpm -F @advance-seeds/mobile
 * build:preview:android` finishes.
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
 *   - Asks `eas build:list` for the latest finished Android preview build.
 *   - Downloads the APK to a temp file.
 *   - Calls `firebase appdistribution:distribute` with --groups internal.
 *
 * Uses execFileSync (not exec) throughout so user-controlled values like
 * APK URL and Firebase app id never reach a shell — eliminates injection
 * risk if .env or EAS metadata is ever attacker-controlled.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const APP_ID = process.env.FIREBASE_ANDROID_APP_ID || readEnvFile().FIREBASE_ANDROID_APP_ID;
if (!APP_ID) {
  console.error(
    "FIREBASE_ANDROID_APP_ID is required (set in env or apps/mobile/.env).\n" +
      "Find it in Firebase Console → Project settings → Your apps → Android app → App ID.",
  );
  process.exit(1);
}

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

console.log("→ uploading to Firebase App Distribution");
execFileSync(
  "firebase",
  [
    "appdistribution:distribute",
    apkPath,
    "--app",
    APP_ID,
    "--groups",
    process.env.FIREBASE_GROUPS || "internal",
    "--release-notes",
    `EAS build ${build.id}`,
  ],
  { stdio: "inherit" },
);
console.log("✔ distribute complete — testers will get an email link");

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
