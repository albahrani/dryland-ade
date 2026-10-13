// Runs the Playwright (Electron) tests on Linux in a throwaway Docker container, on a copy of the working tree.
// Usage: pnpm test:e2e:linux [playwright args...]
// The app runs on a virtual X display (xvfb). CI runs the same tests natively on Windows.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const node = readFileSync(new URL("../.node-version", import.meta.url), "utf8").trim();
const { packageManager } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const args = process.argv.slice(2).join(" ");

// Electron's runtime libraries, a display server, and `less` for the full-screen test.
const packages = "xvfb xauth less libgtk-3-0 libnss3 libgbm1 libxss1 libxtst6 libatk-bridge2.0-0 libcups2 libdrm2";

const script = [
  "set -e",
  "mkdir /work && tar -C /src --exclude=node_modules --exclude=dist --exclude=out --exclude=.git -cf - . | tar -C /work -xf -",
  "cd /work && git init -q --initial-branch=main",
  "apt-get update -qq",
  // The ALSA package is called libasound2t64 on newer Debian releases.
  `apt-get install -y -qq --no-install-recommends ${packages} libasound2t64  || apt-get install -y -qq --no-install-recommends ${packages} libasound2`,
  `npm i -g ${packageManager} `,
  "pnpm install --frozen-lockfile --reporter=append-only",
  // Running as root, Chromium's sandbox cannot start; the container is the sandbox.
  "export ELECTRON_DISABLE_SANDBOX=1",
  // `xvfb-run` hangs as the container's PID 1, so the display server is started by hand.
  "Xvfb :99 -screen 0 1600x1000x24 -nolisten tcp &",
  "export DISPLAY=:99",
  "sleep 2",
  `pnpm --filter @dryland/desktop test:e2e ${args}`,
].join("\n");

const result = spawnSync("docker", ["run", "--rm", "--init", "-v", `${root}:/src:ro`, `node:${node}`, "bash", "-c", script], {
  stdio: "inherit",
  env: { ...process.env, MSYS_NO_PATHCONV: "1" },
});
process.exit(result.status ?? 1);
