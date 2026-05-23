import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(root, "models.tsx"), "utf8");

test("model registry reloads installed models when the screen regains focus", () => {
  assert.match(
    source,
    /import \{ useFocusEffect, useLocalSearchParams, useRouter \} from "expo-router";/,
  );
  assert.match(
    source,
    /useFocusEffect\(\s*useCallback\(\(\) => \{\s*void reloadInstalled\(\);/s,
  );
});

test("model registry refresh also reloads the installed model list", () => {
  assert.match(
    source,
    /setCandidates\(list\);\s*await reloadInstalled\(\);\s*if \(resolveRes\)/s,
  );
});
