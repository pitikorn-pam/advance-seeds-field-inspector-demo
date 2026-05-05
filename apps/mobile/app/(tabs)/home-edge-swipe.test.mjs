import { readFileSync } from "node:fs";
import { URL } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const source = readFileSync(new URL("./index.tsx", import.meta.url), "utf8");

test("Home edge swipe is scoped to the left edge instead of the full screen", () => {
  assert.equal(
    source.includes("return (\n    <GestureDetector gesture={edgeSwipe}>"),
    false,
    "Home content must not be wrapped in the edge swipe GestureDetector",
  );

  const scrollViewIndex = source.indexOf("<ScrollView");
  const edgeGestureIndex = source.indexOf("<GestureDetector gesture={edgeSwipe}>");
  assert.ok(scrollViewIndex > -1, "Home should still render the main ScrollView");
  assert.ok(edgeGestureIndex > scrollViewIndex, "edge swipe hit zone should render after content");

  assert.match(
    source,
    /<GestureDetector gesture=\{edgeSwipe\}>[\s\S]*width: EDGE_TRIGGER_PX,[\s\S]*<\/GestureDetector>/,
    "edge swipe should be attached to a narrow EDGE_TRIGGER_PX hit zone",
  );
});
