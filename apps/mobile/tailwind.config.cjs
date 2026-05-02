const tokens = require("@advance-seeds/tokens/tailwind.preset");

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require("nativewind/preset"), tokens],
  // Override the tokens preset's `["class", '[data-theme="dark"]']` form.
  // NativeWind's css-to-rn parser doesn't accept the array form — it emits an
  // unsupported `@cssInterop set darkMode attribute` directive. Mobile flips
  // dark via NativeWind's colorScheme API on a class, so plain "class" is the
  // right shape here.
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
};
