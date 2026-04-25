const tokens = require("@advance-seeds/tokens/tailwind.preset");

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [tokens],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
};
