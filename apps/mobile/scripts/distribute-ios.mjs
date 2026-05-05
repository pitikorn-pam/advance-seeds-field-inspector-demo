#!/usr/bin/env node
/* global console, process */
/**
 * Pushes an iOS IPA to Firebase App Distribution.
 *
 * Preferred local-release path:
 *   FIREBASE_IPA_PATH=build/AdvanceSeedsFieldInspector.ipa \
 *     pnpm -F @advance-seeds/mobile dist:ios
 *
 * EAS path:
 *   Pulls the latest finished EAS iOS preview build's IPA URL and distributes
 *   it. Run only after `pnpm -F @advance-seeds/mobile build:preview:ios`
 *   finishes.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

const APP_ID = process.env.FIREBASE_IOS_APP_ID || readEnvFile().FIREBASE_IOS_APP_ID;
if (!APP_ID) {
  console.error(
    "FIREBASE_IOS_APP_ID is required (set in env or apps/mobile/.env).\n" +
      "Find it in Firebase Console -> Project settings -> Your apps -> iOS app -> App ID.",
  );
  process.exit(1);
}

const requestedIpaPath = process.env.FIREBASE_IPA_PATH;
const { ipaPath, releaseNotes } = requestedIpaPath
  ? localIpa(requestedIpaPath)
  : latestEasIpa();

const groups = process.env.FIREBASE_GROUPS || "pilot";
console.info(`-> uploading to Firebase App Distribution (group: ${groups})`);
try {
  execFileSync(
    "firebase",
    [
      "appdistribution:distribute",
      ipaPath,
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
  console.error("");
  console.error(`x Firebase distribute failed. Check that tester group "${groups}" exists.`);
  console.error(
    "  List groups with: firebase appdistribution:group:list --project advance-seeds-field-inspector",
  );
  throw err;
}
console.info("OK distribute complete - testers will get an email link");

function localIpa(path) {
  const ipaPath = isAbsolute(path) ? path : resolve(process.cwd(), path);
  if (!existsSync(ipaPath)) {
    console.error(`FIREBASE_IPA_PATH does not exist: ${ipaPath}`);
    process.exit(1);
  }
  let releaseNotes = "Local iOS build";
  try {
    const tag = execFileSync("git", ["describe", "--tags", "--always", "--dirty"], {
      encoding: "utf8",
    }).trim();
    if (tag) releaseNotes = `Local iOS build ${tag}`;
  } catch {
    // Keep the generic release notes.
  }
  console.info(`-> using local IPA: ${ipaPath}`);
  return { ipaPath, releaseNotes };
}

function latestEasIpa() {
  console.info("-> querying EAS for latest finished iOS preview build");
  const buildsJson = execFileSync(
    "eas",
    [
      "build:list",
      "--platform",
      "ios",
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
    console.error("No finished EAS iOS preview builds found.");
    process.exit(1);
  }
  const url = build.artifacts?.buildUrl;
  if (!url) {
    console.error("Build has no artifacts.buildUrl - is it really finished?");
    process.exit(1);
  }
  console.info(`-> build ${build.id} (${build.completedAt}); IPA: ${url}`);

  const dir = mkdtempSync(join(tmpdir(), "advance-seeds-ipa-"));
  const ipaPath = join(dir, "app-preview.ipa");
  console.info("-> downloading IPA");
  execFileSync("curl", ["-fLs", "--output", ipaPath, url], { stdio: "inherit" });
  return { ipaPath, releaseNotes: `EAS build ${build.id}` };
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
