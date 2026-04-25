import root from "../../eslint.config.mjs";

export default [
  ...root,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
      },
    },
  },
];
