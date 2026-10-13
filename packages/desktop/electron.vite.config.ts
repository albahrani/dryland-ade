import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

export default defineConfig({
  // @dryland/core is workspace TypeScript source, so it is bundled rather than externalised.
  main: { build: { rollupOptions: { input: { index: resolve("src/main/index.ts") } } } },
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
