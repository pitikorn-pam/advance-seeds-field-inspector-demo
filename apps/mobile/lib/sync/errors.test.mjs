import { test } from "node:test";
import assert from "node:assert/strict";

import { isQueueableSyncError, syncErrorMessage } from "./errors.ts";

test("network fetch failures are queueable", () => {
  assert.equal(isQueueableSyncError(new TypeError("Network request failed")), true);
});

test("Supabase service failures are queueable", () => {
  assert.equal(isQueueableSyncError({ status: 503, message: "Service unavailable" }), true);
});

test("Supabase validation failures are not queueable", () => {
  assert.equal(isQueueableSyncError({ status: 400, message: "Missing variety" }), false);
});

test("syncErrorMessage prefers structured message fields", () => {
  assert.equal(syncErrorMessage({ message: "Network request failed" }), "Network request failed");
});
