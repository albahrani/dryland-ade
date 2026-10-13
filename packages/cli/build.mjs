import { build } from "esbuild";

await build({
  entryPoints: ["src/main.ts"],
  outfile: "dist/dryland.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
});
