module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }], "nativewind/babel"],
    // Two plugins, two jobs:
    // 1. `react-native-worklets/plugin` — Reanimated 4's worklets engine.
    //    Required for any code marked 'worklet' under `react-native-reanimated`
    //    (gesture handlers, animated styles).
    // 2. `react-native-worklets-core/plugin` — vision-camera 4's frame
    //    processor worklets. A separate, older library by the same author;
    //    coexists with #1 (each ships its own JSI runtime). MUST be present
    //    or vision-camera silently disables frame processors at build time.
    // Order matters in the Babel plugin chain — worklets-core first so it
    // sees `useFrameProcessor` callsites before reanimated's transformer
    // touches them.
    plugins: ["react-native-worklets-core/plugin", "react-native-worklets/plugin"],
  };
};
