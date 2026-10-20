import { DrylandError } from "./errors.ts";
import { findMainCheckout } from "./main-checkout.ts";
import type { ProcessRunner } from "./process-runner.ts";
import { findTicket, parseTicketReference, readTickets } from "./tickets.ts";
import { defaultBranch } from "./tracker-write.ts";
import { gitIn, listWorktrees, pruneWorktree } from "./worktree.ts";

/** Something that stops a merge: a dirty tree, conflicts, or a main checkout that cannot take the merge. */
export type MergeBlocker =
  | { kind: "dirty-worktree" }
  | { kind: "dirty-main" }
  | { kind: "main-off-default"; current: string | null }
  | { kind: "nothing-to-merge" }
  | { kind: "conflicts"; files: string[] };

export interface MergeCheck {
  branch: string;
  /** The default branch the merge lands on. */
  base: string;
  /** Commits on the branch the default branch lacks. */
  ahead: number;
  blockers: MergeBlocker[];
  /** Things worth knowing that do not stop the merge, such as an unresolved ticket. */
  hints: string[];
}

export type MergeStrategy = "merge" | "fast-forward" | "squash";

export const MERGE_STRATEGIES: readonly MergeStrategy[] = ["merge", "fast-forward", "squash"];

/** One sentence naming what a blocker is and what to do about it. */
export function describeBlocker(blocker: MergeBlocker, base: string): string {
  switch (blocker.kind) {
    case "dirty-worktree":
      return "the worktree has uncommitted changes; commit or stash them";
    case "dirty-main":
      return `the main checkout has uncommitted changes; the merge lands there on ${base}`;
    case "main-off-default":
      return `the main checkout is on ${blocker.current ?? "a detached HEAD"}, not ${base}, where the merge lands`;
    case "nothing-to-merge":
      return `the branch has no commits that ${base} lacks`;
    case "conflicts":
      return `merging would conflict in ${blocker.files.join(", ")}`;
  }
}

/**
 * The dry run: what would stop merging `branch` into the default branch. Touches no file; the conflict probe
 * (`git merge-tree`) only writes objects. A dirty tree and conflicts block; an unresolved ticket is a hint.
 */
export async function checkMerge(runner: ProcessRunner, cwd: string, branch: string): Promise<MergeCheck> {
  const mainCheckout = await findMainCheckout(runner, cwd);
  const base = await defaultBranch(runner, mainCheckout);
  if (base === null) {
    throw new DrylandError("The repo has no default branch to merge into.", "Create a commit on a branch first.");
  }
  const entry = (await listWorktrees(runner, mainCheckout)).find((e) => e.branch === branch);
  if (entry === undefined || entry.main) {
    throw new DrylandError(`There is no linked worktree on branch ${branch}.`, "Pick a linked worktree to merge.");
  }

  const blockers: MergeBlocker[] = [];
  const hints: string[] = [];
  const worktreeStatus = await gitIn(runner, entry.path, ["status", "--porcelain"], "checking the worktree");
  if (worktreeStatus.trim() !== "") blockers.push({ kind: "dirty-worktree" });
  const mainStatus = await gitIn(
    runner,
    mainCheckout,
    ["status", "--porcelain", "--untracked-files=no"],
    "checking the main checkout",
  );
  if (mainStatus.trim() !== "") blockers.push({ kind: "dirty-main" });
  const current = (await gitIn(runner, mainCheckout, ["branch", "--show-current"], "reading the main checkout")).trim();
  if (current !== base) blockers.push({ kind: "main-off-default", current: current === "" ? null : current });

  const ahead = Number(
    (await gitIn(runner, mainCheckout, ["rev-list", "--count", `${base}..${branch}`], "counting commits")).trim(),
  );
  if (ahead === 0) blockers.push({ kind: "nothing-to-merge" });

  // Exit 1 means conflicts, listed by name after the tree id; anything else is a failed probe.
  const probe = await runner.run("git", ["merge-tree", "--write-tree", "--name-only", "--no-messages", base, branch], {
    cwd: mainCheckout,
  });
  if (probe.exitCode === 1) {
    const files = probe.stdout
      .split(/\r?\n/)
      .slice(1)
      .filter((line) => line !== "");
    blockers.push({ kind: "conflicts", files });
  } else if (probe.exitCode !== 0) {
    throw new DrylandError(
      `git merge-tree failed: ${(probe.stderr || probe.stdout).trim()}`,
      "Update git and try again.",
    );
  }

  if (entry.link.ticket !== null) {
    const ticket = findTicket(await readTickets(mainCheckout, runner), parseTicketReference(entry.link.ticket));
    if (ticket.state !== "resolved") hints.push(`ticket ${entry.link.ticket} is not resolved (it is ${ticket.state})`);
  }
  return { branch, base, ahead, blockers, hints };
}

export interface MergeOptions {
  strategy: MergeStrategy;
  /** Remove the worktree and branch afterwards, when the prune conditions hold. */
  cleanup: boolean;
  /** Whether a live session is attached to the worktree; the app supplies this. */
  sessionAttached: boolean;
}

export interface MergeResult {
  branch: string;
  base: string;
  strategy: MergeStrategy;
  /** The tip of the default branch after the merge. */
  commit: string;
  /** `null` when cleanup was not asked for; otherwise whether it ran, and why not when it did not. */
  cleanup: { removed: true } | { removed: false; refused: string } | null;
}

/**
 * Merges the worktree branch into the default branch in the main checkout. Refuses while any blocker stands, and
 * never resolves a conflict. With `cleanup`, prunes the worktree afterwards; a refused prune does not undo the merge.
 */
export async function mergeWorktree(
  runner: ProcessRunner,
  cwd: string,
  branch: string,
  options: MergeOptions,
): Promise<MergeResult> {
  const mainCheckout = await findMainCheckout(runner, cwd);
  const check = await checkMerge(runner, mainCheckout, branch);
  if (check.blockers.length > 0) {
    throw new DrylandError(
      `Will not merge ${branch}: ${check.blockers.map((b) => describeBlocker(b, check.base)).join("; ")}.`,
      "Clear what is listed, then merge again.",
    );
  }
  const merging = `merging ${branch}`;
  switch (options.strategy) {
    case "merge":
      await gitIn(runner, mainCheckout, ["merge", "--no-ff", "--no-edit", branch], merging);
      break;
    case "fast-forward":
      await gitIn(runner, mainCheckout, ["merge", "--ff-only", branch], merging);
      break;
    case "squash":
      await gitIn(runner, mainCheckout, ["merge", "--squash", branch], merging);
      await gitIn(runner, mainCheckout, ["commit", "-q", "-m", `Merge ${branch} (squashed)`], merging);
      break;
  }
  const commit = (await gitIn(runner, mainCheckout, ["rev-parse", "HEAD"], merging)).trim();

  let cleanup: MergeResult["cleanup"] = null;
  if (options.cleanup) {
    try {
      await pruneWorktree(runner, mainCheckout, branch, { yes: true, sessionAttached: options.sessionAttached });
      cleanup = { removed: true };
    } catch (error) {
      if (!(error instanceof DrylandError)) throw error;
      cleanup = { removed: false, refused: error.message };
    }
  }
  return { branch, base: check.base, strategy: options.strategy, commit, cleanup };
}
