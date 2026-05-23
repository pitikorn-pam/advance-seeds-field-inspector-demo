const path = require("node:path");

const _expoDir = path.dirname(require.resolve("expo/package.json", { paths: [__dirname] }));
const { withGradleProperties } = require(
  require.resolve("@expo/config-plugins", { paths: [_expoDir] }),
);

const RELEASE_SIZE_PROPERTIES = {
  "android.enableMinifyInReleaseBuilds": "true",
  "android.enableShrinkResourcesInReleaseBuilds": "true",
  "expo.gif.enabled": "false",
  "expo.webp.enabled": "false",
};

function upsertProperty(properties, key, value) {
  const existing = properties.find((item) => item.type === "property" && item.key === key);
  if (existing) {
    existing.value = value;
    return;
  }
  properties.push({ type: "property", key, value });
}

function withSizeOptimizations(config) {
  return withGradleProperties(config, (config) => {
    for (const [key, value] of Object.entries(RELEASE_SIZE_PROPERTIES)) {
      upsertProperty(config.modResults, key, value);
    }
    return config;
  });
}

module.exports = withSizeOptimizations;
