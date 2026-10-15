import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

export default defineConfig({
  // @dryland/core is workspace TypeScript source, so it is bundled rather than externalised.
  // The `dryland` CLI is built beside the main process, so the launcher can run it with the app's Electron.
  main: {
    build: {
      rollupOptions: { input: { index: resolve("src/main/index.ts"), dryland: resolve("../cli/src/main.ts") } },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: { index: resolve("src/preload/index.ts") },
        // A sandboxed preload script must be CommonJS.
        output: { format: "cjs", entryFileNames: "[name].cjs" },
      },
    },
  },
  renderer: {
    root: "src/renderer",
    build: { rollupOptions: { input: { index: resolve("src/renderer/index.html") } } },
    plugins: [react()],
  },
});
