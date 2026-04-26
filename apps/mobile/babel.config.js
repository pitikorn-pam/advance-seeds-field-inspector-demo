module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }], "nativewind/babel"],
    // Reanimated 4's worklets transformer. Must be the LAST plugin in the
    // chain so it processes already-transformed code.
    //
    // Note on react-native-worklets-core: vision-camera 4's frame-processor
    // plugin (`react-native-worklets-core/plugin`) is intentionally NOT here.
    // It expects a matching native runtime to be linked into the app binary,
    // and the dev-client APK shipped before we added `react-native-worklets-core`
    // as a JS dep. Adding the babel plugin without the native side causes
    // Metro to hang silently in the transformer.
    //
    // Phase 4 of mobile-real-usage rebuilds the EAS dev client with
    // worklets-core in the native graph; at that point this list becomes:
    //   ["react-native-worklets-core/plugin", "react-native-worklets/plugin"]
    plugins: ["react-native-worklets/plugin"],
  };
};
