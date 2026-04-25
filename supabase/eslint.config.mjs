import root from "../eslint.config.mjs";

export default [
  ...root,
  {
    files: ["scripts/**/*.{ts,mjs}"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        URL: "readonly",
      },
    },
  },
];
