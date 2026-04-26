module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }], "nativewind/babel"],
    // Expo SDK 54 ships Reanimated 4, which moved the plugin to a dedicated
    // react-native-worklets package. The old `react-native-reanimated/plugin`
    // is deprecated — pinning to the new path silences the warning and
    // future-proofs against the next Reanimated bump.
    plugins: ["react-native-worklets/plugin"],
  };
};
