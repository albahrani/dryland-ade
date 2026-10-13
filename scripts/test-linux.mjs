// Runs the full suite on Linux in a throwaway Docker container, on a copy of the working tree.
// Usage: pnpm test:linux [vitest args...]   (from Windows, this is the second half of "run the tests".)
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const node = readFileSync(new URL("../.node-version", import.meta.url), "utf8").trim();
const { packageManager } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const args = process.argv.slice(2).join(" ");

// The copy leaves out node_modules and dist, which hold the host's platform binaries.
const script = [
  "set -e",
  "mkdir /work && tar -C /src --exclude=node_modules --exclude=dist --exclude=.git -cf - . | tar -C /work -xf -",
  "cd /work && git init -q --initial-branch=main",
  `npm i -g ${packageManager} >/dev/null 2>&1`,
  "ELECTRON_SKIP_BINARY_DOWNLOAD=1 pnpm install --frozen-lockfile >/dev/null",
  `pnpm test ${args}`,
].join("\n");

const result = spawnSync("docker", ["run", "--rm", "-v", `${root}:/src:ro`, `node:${node}`, "bash", "-c", script], {
  stdio: "inherit",
  env: { ...process.env, MSYS_NO_PATHCONV: "1" },
});
process.exit(result.status ?? 1);
