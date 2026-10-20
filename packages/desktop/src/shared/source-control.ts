import type { Forge, MergeCheck, MergeResult, MergeStrategy, PullRequest } from "@dryland/core";
import type { ChangedFile } from "./explorer.ts";

/** What a worktree's index and working tree hold, against HEAD. */
export interface SourceControlStatus {
  /** In the index: what the next commit would contain. */
  staged: ChangedFile[];
  /** In the working tree only: edited, deleted or new files not staged yet. */
  changed: ChangedFile[];
}

export interface GraphCommit {
  hash: string;
  subject: string;
  /** `branch` commits are the worktree branch's own; `base` ones are on the default branch. */
  side: "branch" | "base";
}

/** The worktree branch's commits relative to the default branch, newest first. */
export interface CommitGraph {
  /** The default branch the commits are compared with; `null` when the repo has none. */
  base: string | null;
  /** Commits on the branch the default branch lacks, and the other way round. */
  ahead: number;
  behind: number;
  commits: GraphCommit[];
}

/** A worktree Dryland did not create and no commit trailer ties to a ticket. */
export interface UnlinkedBranch {
  branch: string | null;
  path: string;
}

export type CommitResult = { ok: true; hash: string } | { ok: false; message: string };

/** The dry run for merging a worktree branch, with each blocker already worded for the pane. */
export interface MergeCheckView extends MergeCheck {
  blockerMessages: string[];
}

/** The PR/MR section of a GitHub or GitLab project's worktree: the request if there is one, else what stops opening it. */
export interface PullRequestSection {
  forge: Forge;
  /** "PR" on GitHub, "MR" on GitLab. */
  name: "PR" | "MR";
  request: PullRequest | null;
  /** Dry-run blockers, worded; empty when the request can be opened. */
  blockerMessages: string[];
  /** Why the forge could not be asked (`gh`/`glab` missing or logged out) with the next action; `null` otherwise. */
  error: string | null;
}

export type PullRequestActionResult = { ok: true; request: PullRequest } | { ok: false; message: string };

/** What a merge, prune or hand-off did; `message` says why not when it did not. */
export type ActionResult = { ok: true } | { ok: false; message: string };
export type MergeActionResult = { ok: true; result: MergeResult } | { ok: false; message: string };

/** What Source Control needs of the app's sessions. */
export interface SessionLinks {
  /** Whether a live session is attached to the worktree at `path`. */
  attached(path: string): boolean;
  /** Pre-types `text`, not submitted, into the live session in the worktree at `path`; `false` when there is none. */
  handToAgent(path: string, text: string): boolean;
  /** Called after a worktree at `path` was removed, to drop what the app keeps for it. */
  onPruned?(path: string): void | Promise<void>;
}

/** The merge strategies the pane offers, in order; the renderer cannot import core's own list. */
export const MERGE_STRATEGIES: readonly MergeStrategy[] = ["merge", "fast-forward", "squash"];
