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
