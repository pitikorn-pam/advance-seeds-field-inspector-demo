import test from "node:test";
import assert from "node:assert/strict";

import { pickFirstLaunchDefaultCandidate } from "./bootstrapPolicy.ts";

function candidate(overrides = {}) {
  return {
    id: "production-v1-ios",
    displayName: "1.0.0",
    quantization: "fp16",
    manifest: {
      key: "production-v1-ios",
      display_name: "1.0.0",
      quantization: "fp16",
      metadata: "__embedded__",
      artifacts: {},
    },
    manifestUrl: "",
    metadataUrl: "",
    artifactUrl: "https://example.test/model.zip",
    platform: "ios",
    supported: true,
    channel: "production",
    isDefault: true,
    ...overrides,
  };
}

test("pickFirstLaunchDefaultCandidate chooses the supported production default", () => {
  const staging = candidate({ id: "staging-v1-ios", channel: "staging" });
  const unsupported = candidate({ id: "production-v2-ios", supported: false });
  const prodDefault = candidate({ id: "production-v3-ios" });

  assert.equal(
    pickFirstLaunchDefaultCandidate([staging, unsupported, prodDefault])?.id,
    prodDefault.id,
  );
});

test("pickFirstLaunchDefaultCandidate returns null without a production default", () => {
  assert.equal(
    pickFirstLaunchDefaultCandidate([
      candidate({ id: "production-not-default", isDefault: false }),
      candidate({ id: "staging-default", channel: "staging" }),
    ]),
    null,
  );
});
