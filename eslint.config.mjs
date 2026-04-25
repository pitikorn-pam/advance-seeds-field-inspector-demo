// Flat config — root-level rules. Per-app rules layered in apps/*/eslint.config.mjs.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import i18next from "eslint-plugin-i18next";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.expo/**",
      "**/.next/**",
      "**/ios/**",
      "**/android/**",
      "docs/handoff/**",
      "openspec/**",
      "**/*.gen.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
      "no-debugger": "error",
      eqeqeq: ["error", "always"],
      "prefer-const": "error",
      "no-var": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  // Apps only: forbid raw literal strings in JSX — every visible string must
  // go through t(). Packages and tools are exempt (they don't render UI).
  {
    files: ["apps/**/*.{ts,tsx}"],
    plugins: { i18next },
    rules: {
      "i18next/no-literal-string": [
        "error",
        {
          mode: "jsx-text-only",
          "jsx-attributes": {
            include: ["alt", "aria-label", "title", "placeholder"],
          },
        },
      ],
    },
  },
];
