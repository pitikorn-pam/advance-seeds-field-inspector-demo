import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// GH Pages base path. Override with VITE_BASE for previews / forks.
const DEFAULT_BASE = "/advance-seeds-field-inspector-demo/";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");
  return {
    base: env.VITE_BASE ?? DEFAULT_BASE,
    plugins: [react()],
    resolve: {
      alias: {
        "@": resolve(__dirname, "src"),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
    },
  };
});
