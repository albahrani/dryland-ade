import type { TicketRef } from "@dryland/core";

/** What a selection asks the Explorer to show: a ticket's worktree, a given worktree, or (`null`) the main checkout. */
export type RootHint = { kind: "ticket"; ticket: TicketRef } | { kind: "worktree"; path: string } | null;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** Whether `value`, which came from the renderer, is a well-formed hint. */
export const isRootHint = (value: unknown): value is RootHint =>
  value === null ||
  (isRecord(value) &&
    ((value.kind === "worktree" && typeof value.path === "string") ||
      (value.kind === "ticket" &&
        isRecord(value.ticket) &&
        typeof value.ticket.map === "string" &&
        typeof value.ticket.id === "string")));

/** The worktree the Explorer shows. */
export interface ExplorerRoot {
  path: string;
  /** `null` for a detached HEAD. */
  branch: string | null;
  main: boolean;
  /** `<map>/<NN>` of the ticket the worktree is linked to, if any. */
  ticket: string | null;
  /** The commit changes are shown against; `null` shows uncommitted changes (HEAD), as the main checkout does. */
  base: string | null;
}

export interface TreeEntry {
  name: string;
  /** Relative to the worktree, with `/`. */
  path: string;
  kind: "file" | "dir";
  /** Ignored by git: shown dimmed, and a directory of it is never expanded (think `node_modules`). */
  ignored: boolean;
}

export interface DirectoryListing {
  entries: TreeEntry[];
  /** More entries than the Explorer lists. */
  truncated: boolean;
}

export type FileContent =
  | { kind: "text"; text: string; /** Only the start of a very large file. */ truncated: boolean }
  | { kind: "binary" }
  | { kind: "missing" };

export type ChangeStatus = "added" | "modified" | "deleted" | "untracked";

export interface ChangedFile {
  path: string;
  status: ChangeStatus;
}

/** How the Explorer names the worktree it shows. */
export function rootLabel(root: Pick<ExplorerRoot, "main" | "branch">): string {
  if (root.main) return `Main checkout${root.branch === null ? "" : ` (${root.branch})`}`;
  return `Worktree ${root.branch ?? "(detached HEAD)"}`;
}
