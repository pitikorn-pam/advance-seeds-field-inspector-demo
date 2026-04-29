import { test } from "node:test";
import assert from "node:assert/strict";

import { activeQueueStatuses, queueCounts } from "./store.ts";

test("queueCounts separates pending, syncing, failed, and synced entries", () => {
  const rows = [
    { status: "pending" },
    { status: "syncing" },
    { status: "failed" },
    { status: "synced" },
  ];

  assert.deepEqual(queueCounts(rows), {
    pending: 2,
    failed: 1,
    synced: 1,
  });
});

test("activeQueueStatuses includes non-terminal visible states", () => {
  assert.deepEqual(activeQueueStatuses(), ["pending", "syncing", "failed"]);
});
