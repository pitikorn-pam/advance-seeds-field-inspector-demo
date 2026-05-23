import { readFileSync } from "node:fs";
import { URL } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const displaySource = readFileSync(new URL("./display.ts", import.meta.url), "utf8");
const notifierSource = readFileSync(
  new URL("../../components/notifications/ModelUpdateNotifier.tsx", import.meta.url),
  "utf8",
);

test("model update notifications store and display the full i18n keys", () => {
  assert.match(notifierSource, /t\("models\.update\.notifyTitle"/);
  assert.match(notifierSource, /t\("models\.update\.notifyBodyWithSize"/);
  assert.doesNotMatch(notifierSource, /t\("update\.notify/);
});

test("legacy model update notification keys are translated at display time", () => {
  assert.match(displaySource, /"update\.notifyTitle"/);
  assert.match(displaySource, /"update\.notifyBodyWithSize"/);
  assert.match(displaySource, /more:models\.update\.notifyTitle/);
  assert.match(displaySource, /more:models\.update\.notifyBodyWithSize/);
});
