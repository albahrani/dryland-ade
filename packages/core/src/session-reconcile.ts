import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { readEfforts } from "./efforts.ts";
import { exists } from "./env-fs.ts";
import { findMainCheckout } from "./main-checkout.ts";
import type { ProcessRunner } from "./process-runner.ts";
import { claudeHistoryDir, type HistoryFile, reconcileIndex, updateSessionIndex } from "./session-index.ts";
import { readTickets } from "./tickets.ts";
import { listWorktrees } from "./worktree.ts";

const SCRATCH_BRANCH = /^([^/]+)\/scratch-.+$/;

export interface ReconcileOptions {
  /** Where Claude Code keeps its history is read from here; defaults to the process environment. */
  env?: NodeJS.ProcessEnv;
  /** The home directory holding `.claude`; defaults to the user's. */
  home?: string;
  now?: Date;
  retentionDays?: number;
}

/** The `<id>.jsonl` files in `directory`, by id and modification time; contents are never read. `null` when it cannot be listed. */
async function listHistory(directory: string): Promise<HistoryFile[] | null> {
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error) {
    // A worktree no Claude Code session ever ran in has no history folder, which is an empty history.
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? [] : null;
  }
  const files: HistoryFile[] = [];
  for (const name of names) {
    if (!name.endsWith(".jsonl")) continue;
    const info = await stat(join(directory, name)).catch(() => null);
    if (info?.isFile()) files.push({ sessionId: name.slice(0, -".jsonl".length), modified: info.mtime });
  }
  return files;
}

/**
 * Brings the session index in line with the tracker, git and Claude Code's history (ADR 0010). Claude Code sessions
 * found in the history folder of a claimed ticket's worktree, or of a scratch worktree, join the index; items of a
 * resolved ticket or a released claim, and Claude Code sessions whose history file is gone, leave it. Copilot CLI
 * is not reconciled: its history is not per directory. Returns whether the index was written, and warnings.
 */
export async function reconcileSessionIndex(
  runner: ProcessRunner,
  cwd: string,
  options: ReconcileOptions = {},
): Promise<{ changed: boolean; warnings: string[] }> {
  const mainCheckout = await findMainCheckout(runner, cwd);
  const env = options.env ?? process.env;
  const home = options.home ?? homedir();
  const now = options.now ?? new Date();
  const [tickets, efforts, worktrees] = await Promise.all([
    readTickets(mainCheckout),
    readEfforts(mainCheckout),
    listWorktrees(runner, mainCheckout),
  ]);
  const maps = new Set(efforts.map((e) => e.name));
  const claimed = new Set(tickets.filter((t) => t.state === "claimed").map((t) => `${t.map}/${t.id}`));

  const dropped = new Set<string>();
  for (const ticket of tickets) {
    const key = `${ticket.map}/${ticket.id}`;
    if (!claimed.has(key)) dropped.add(key);
  }

  const claudeHistory: Record<string, HistoryFile[]> = {};
  const unreadable = new Set<string>();
  for (const worktree of worktrees) {
    if (worktree.main || !(await exists(worktree.path))) continue;
    const { ticket } = worktree.link;
    let item: string | null = null;
    if (ticket !== null) item = claimed.has(ticket) ? ticket : null;
    else if (worktree.link.kind === "scratch" && worktree.branch !== null) {
      // A map's own worktree stands for the map; a new map's, not yet charted, for its branch.
      const map = SCRATCH_BRANCH.exec(worktree.branch)?.[1];
      item = map !== undefined && maps.has(map) ? map : worktree.branch;
    }
    if (item === null) continue;
    const directory = claudeHistoryDir(env, home, worktree.path);
    const files = directory === null ? null : await listHistory(directory);
    if (files === null) unreadable.add(item);
    else claudeHistory[item] = [...(claudeHistory[item] ?? []), ...files];
  }
  // A history that could not be listed says nothing, so an item with one keeps the sessions it has.
  for (const item of unreadable) delete claudeHistory[item];

  const { warnings, written } = await updateSessionIndex(runner, mainCheckout, (index) =>
    reconcileIndex(index, { dropped, claudeHistory }, now, options.retentionDays),
  );
  return { changed: written, warnings };
}
