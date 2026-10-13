import { dirname } from "node:path";
import type { ProcessRunner } from "./process-runner.ts";

/** Finds the main checkout from any directory of the repo or one of its linked worktrees. */
export async function findMainCheckout(runner: ProcessRunner, cwd: string): Promise<string | null> {
  const result = await runner.run("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd });
  if (result.exitCode !== 0) return null;
  return dirname(result.stdout.trim());
}
