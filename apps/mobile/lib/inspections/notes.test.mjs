import { test } from "node:test";
import assert from "node:assert/strict";

import { displayInspectionNote } from "./notes.ts";

test("displayInspectionNote returns trimmed note text", () => {
  assert.equal(displayInspectionNote("  Field row A, cloudy light  "), "Field row A, cloudy light");
});

test("displayInspectionNote hides empty notes", () => {
  assert.equal(displayInspectionNote("   "), null);
  assert.equal(displayInspectionNote(null), null);
  assert.equal(displayInspectionNote(undefined), null);
});
