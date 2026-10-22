import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { removeScopedTmp, scopeTmp } from "./scoped-tmp.ts";

// Builds the real `dryland` bundle once; the harness runs that file. The run's temp folders live in one directory
// that is deleted at the end.
export default function setup(): () => void {
  scopeTmp();
  const cliDir = fileURLToPath(new URL("..", import.meta.url));
  execFileSync(process.execPath, ["build.mjs"], { cwd: cliDir, stdio: "inherit" });
  return removeScopedTmp;
}
