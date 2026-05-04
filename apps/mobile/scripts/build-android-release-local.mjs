#!/usr/bin/env node
/**
 * Builds the local Android release APK from the generated native project.
 *
 * Expo prebuild regenerates android/gradle.properties with a small metaspace
 * cap. The release graph for VisionCamera, TFLite, Expo Updates, and the
 * native modules exceeds that cap during :app:compileReleaseKotlin, so this
 * wrapper patches the generated file before invoking Gradle.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const mobileRoot = join(scriptDir, "..");
const androidRoot = join(mobileRoot, "android");
const gradlePropertiesPath = join(androidRoot, "gradle.properties");

if (!existsSync(gradlePropertiesPath)) {
  console.error(
    "android/gradle.properties not found. Run `pnpm -F mobile exec expo prebuild --platform android --no-install` first.",
  );
  process.exit(1);
}

const desiredJvmArgs = "-Xmx4096m -XX:MaxMetaspaceSize=1536m";
const current = readFileSync(gradlePropertiesPath, "utf8");
const next = current.includes("org.gradle.jvmargs=")
  ? current.replace(/^org\.gradle\.jvmargs=.*$/m, `org.gradle.jvmargs=${desiredJvmArgs}`)
  : `${current.trimEnd()}\norg.gradle.jvmargs=${desiredJvmArgs}\n`;

if (next !== current) {
  writeFileSync(gradlePropertiesPath, next);
  console.log(`Patched android/gradle.properties with org.gradle.jvmargs=${desiredJvmArgs}`);
}

execFileSync("./gradlew", [":app:assembleRelease", "--console=plain"], {
  cwd: androidRoot,
  env: androidBuildEnv(),
  stdio: "inherit",
});

function androidBuildEnv() {
  const env = { ...process.env };
  const androidStudioJbr = "/Applications/Android Studio.app/Contents/jbr/Contents/Home";
  if (!env.JAVA_HOME && existsSync(androidStudioJbr)) {
    env.JAVA_HOME = androidStudioJbr;
  }
  const androidSdk = join(homedir(), "Library/Android/sdk");
  if (!env.ANDROID_HOME && existsSync(androidSdk)) {
    env.ANDROID_HOME = androidSdk;
  }
  if (!env.ANDROID_SDK_ROOT && env.ANDROID_HOME) {
    env.ANDROID_SDK_ROOT = env.ANDROID_HOME;
  }
  return env;
}
