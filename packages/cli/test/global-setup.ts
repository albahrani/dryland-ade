import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Builds the real `dryland` bundle once; the harness runs that file.
export default function setup(): void {
  const cliDir = fileURLToPath(new URL("..", import.meta.url));
  execFileSync(process.execPath, ["build.mjs"], { cwd: cliDir, stdio: "inherit" });
}
