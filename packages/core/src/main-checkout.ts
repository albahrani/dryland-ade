import { basename, dirname, resolve } from "node:path";
import { DrylandError } from "./errors.ts";
import type { ProcessRunner } from "./process-runner.ts";

/**
 * Finds the main checkout from any directory of the repo or one of its linked worktrees.
 * Inside the main worktree git names it directly. From a linked worktree it is the parent of
 * the shared `.git` common dir, unless `core.worktree` says otherwise.
 */
export async function findMainCheckout(runner: ProcessRunner, cwd: string): Promise<string> {
  const git = (args: string[]) => runner.run("git", args, { cwd });
  const dirs = await git(["rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir"]);
  if (dirs.exitCode !== 0) {
    throw new DrylandError(
      `${cwd} is not inside a git repository.`,
      "Run dryland from inside the repo, or from one of its worktrees.",
    );
  }
  const [gitDir = "", commonDir = ""] = dirs.stdout.replace(/\r\n/g, "\n").trim().split("\n");
  const config = async (key: string) =>
    (await git(["config", "--file", resolve(commonDir, "config"), "--get", key])).stdout.trim();

  if ((await config("core.bare")) === "true") {
    throw new DrylandError(
      `${commonDir} is a bare repository with no working tree, so it has no main checkout.`,
      "Run dryland from a worktree of this repo.",
    );
  }
  if (gitDir === commonDir) {
    return (await git(["rev-parse", "--show-toplevel"])).stdout.trim();
  }
  const worktree = await config("core.worktree");
  if (worktree !== "") return resolve(commonDir, worktree);
  if (basename(commonDir) === ".git") return dirname(commonDir);
  throw new DrylandError(
    `Cannot locate the main checkout from this worktree: its git directory ${commonDir} is outside the working tree.`,
    "Run dryland from the main checkout instead.",
  );
}
