import test from "node:test";
import assert from "node:assert/strict";

import {
  applyAdd,
  applyClearFailed,
  applyMarkFailed,
  applyRemove,
  applyRetryAllFailed,
  applyUpdate,
  syncErrorMessage,
} from "./transitions.mjs";

const FIXED_NOW = "2026-04-30T10:00:00.000Z";
const LATER = "2026-04-30T10:05:00.000Z";

function fakeClock(now = FIXED_NOW, id = "queue-test-1") {
  return { now: () => now, id: () => id };
}

function makePayload(label = "alpha") {
  return {
    kind: "inspection",
    data: {
      inspector_id: "u1",
      variety_id: "v1",
      batch_id: null,
      calibration_id: null,
      local_media_uri: `file://${label}.jpg`,
      remote_media_url: null,
      media_kind: "photo",
      total_seeds: 0,
      mean_length_mm: null,
      mean_width_mm: null,
      mean_area_mm2: null,
      metadata: null,
      notes: null,
      seeds: [],
    },
  };
}

test("applyAdd prepends a fresh pending entry with stable timestamps", () => {
  const { next, entry } = applyAdd([], makePayload(), fakeClock());
  assert.equal(next.length, 1);
  assert.equal(entry.status, "pending");
  assert.equal(entry.attempts, 0);
  assert.equal(entry.createdAt, FIXED_NOW);
  assert.equal(entry.updatedAt, FIXED_NOW);
  assert.equal(entry.lastError, null);
  assert.equal(entry.remoteId, null);
  assert.equal(entry.id, "queue-test-1");
  assert.equal(next[0], entry);
});

test("applyAdd preserves existing entries and prepends the new one", () => {
  const first = applyAdd([], makePayload("a"), fakeClock(FIXED_NOW, "id-a")).next;
  const second = applyAdd(first, makePayload("b"), fakeClock(LATER, "id-b")).next;
  assert.equal(second.length, 2);
  assert.equal(second[0].id, "id-b");
  assert.equal(second[1].id, "id-a");
});

test("applyUpdate patches the targeted entry and bumps updatedAt", () => {
  const { next: seeded } = applyAdd([], makePayload(), fakeClock());
  const updated = applyUpdate(
    seeded,
    seeded[0].id,
    { status: "syncing", lastError: null },
    fakeClock(LATER),
  );
  assert.equal(updated[0].status, "syncing");
  assert.equal(updated[0].updatedAt, LATER);
  assert.equal(updated[0].createdAt, FIXED_NOW);
});

test("applyUpdate ignores entries that don't match the id", () => {
  const seeded = applyAdd([], makePayload(), fakeClock(FIXED_NOW, "real")).next;
  const result = applyUpdate(seeded, "other", { status: "synced" }, fakeClock(LATER));
  assert.equal(result[0].status, "pending");
  assert.equal(result[0].updatedAt, FIXED_NOW);
});

test("applyRemove drops the matching entry", () => {
  const a = applyAdd([], makePayload(), fakeClock(FIXED_NOW, "a")).next;
  const ab = applyAdd(a, makePayload(), fakeClock(LATER, "b")).next;
  const next = applyRemove(ab, "a");
  assert.equal(next.length, 1);
  assert.equal(next[0].id, "b");
});

test("applyClearFailed removes only failed entries", () => {
  const a = applyAdd([], makePayload(), fakeClock(FIXED_NOW, "a")).next;
  const ab = applyAdd(a, makePayload(), fakeClock(LATER, "b")).next;
  const failed = applyMarkFailed(ab, "a", new Error("boom"), fakeClock(LATER));
  const cleared = applyClearFailed(failed);
  assert.equal(cleared.length, 1);
  assert.equal(cleared[0].id, "b");
});

test("applyRetryAllFailed promotes failed AND syncing back to pending", () => {
  const seeded = [
    {
      id: "failed",
      status: "failed",
      attempts: 1,
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
      lastError: "previous",
      remoteId: null,
      payload: makePayload(),
    },
    {
      id: "syncing",
      status: "syncing",
      attempts: 0,
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
      lastError: null,
      remoteId: null,
      payload: makePayload(),
    },
    {
      id: "synced",
      status: "synced",
      attempts: 1,
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
      lastError: null,
      remoteId: "remote-1",
      payload: makePayload(),
    },
  ];
  const next = applyRetryAllFailed(seeded, fakeClock(LATER));
  assert.equal(next.find((e) => e.id === "failed").status, "pending");
  assert.equal(next.find((e) => e.id === "failed").lastError, null);
  assert.equal(next.find((e) => e.id === "failed").updatedAt, LATER);
  assert.equal(next.find((e) => e.id === "syncing").status, "pending");
  // Already-synced rows are left alone.
  assert.equal(next.find((e) => e.id === "synced").status, "synced");
});

test("applyMarkFailed bumps attempts and records the error", () => {
  const { next: seeded } = applyAdd([], makePayload(), fakeClock());
  const failed = applyMarkFailed(seeded, seeded[0].id, new Error("upload failed"), fakeClock(LATER));
  assert.equal(failed[0].status, "failed");
  assert.equal(failed[0].attempts, 1);
  assert.equal(failed[0].lastError, "upload failed");
  assert.equal(failed[0].updatedAt, LATER);
});

test("applyMarkFailed accumulates attempts on repeated failures", () => {
  const { next: seeded } = applyAdd([], makePayload(), fakeClock());
  const once = applyMarkFailed(seeded, seeded[0].id, new Error("first"), fakeClock(LATER));
  const twice = applyMarkFailed(once, once[0].id, new Error("second"), fakeClock(LATER));
  assert.equal(twice[0].attempts, 2);
  assert.equal(twice[0].lastError, "second");
});

test("syncErrorMessage extracts useful messages from common shapes", () => {
  assert.equal(syncErrorMessage(new Error("boom")), "boom");
  assert.equal(syncErrorMessage({ message: "explicit" }), "explicit");
  assert.equal(syncErrorMessage({ details: "details-only" }), "details-only");
  assert.equal(syncErrorMessage("plain string"), "plain string");
  // Falls through to JSON for unknown shapes.
  assert.equal(syncErrorMessage({ code: 42 }), JSON.stringify({ code: 42 }));
});

test("transition output is JSON-roundtrippable so persistence stays lossless", () => {
  const { next } = applyAdd([], makePayload(), fakeClock());
  const updated = applyUpdate(next, next[0].id, { status: "synced", remoteId: "r-1" }, fakeClock(LATER));
  const json = JSON.stringify(updated);
  const parsed = JSON.parse(json);
  assert.equal(parsed[0].status, "synced");
  assert.equal(parsed[0].remoteId, "r-1");
  assert.equal(parsed[0].payload.kind, "inspection");
});
