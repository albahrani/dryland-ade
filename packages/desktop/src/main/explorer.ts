import { realpathSync } from "node:fs";
import { open, readdir } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import {
  defaultBranch,
  DrylandError,
  findMainCheckout,
  listWorktrees,
  type ProcessRunner,
  type TicketRef,
} from "@dryland/core";
import type {
  ChangedFile,
  ChangeStatus,
  DiffContent,
  DirectoryListing,
  ExplorerRoot,
  FileContent,
  RootHint,
} from "../shared/explorer.ts";
import { isRelativeInside } from "../shared/paths.ts";

const MAX_ENTRIES = 2000;
const MAX_FILE_BYTES = 1024 * 1024;
const BINARY_SNIFF_BYTES = 8000;

const STATUS: Record<string, ChangeStatus> = { A: "added", M: "modified", D: "deleted", T: "modified" };

/** What `git diff` prints for a binary file, in place of hunks. */
const BINARY_DIFF = /^Binary files .* differ$/m;

/** The latest index at or before `limit` that does not fall inside a multi-byte UTF-8 character. */
function utf8Boundary(bytes: Uint8Array, limit: number): number {
  let end = limit;
  // Continuation bytes are 10xxxxxx; step back to the lead byte of the character the limit cuts.
  while (end > 0 && (bytes[end]! & 0xc0) === 0x80) end--;
  return end;
}

/** The path as the file system names it: no 8.3 short names, no symlinks, no case difference on Windows. */
const canonical = (path: string): string => {
  let real = resolve(path);
  try {
    real = realpathSync.native(real);
  } catch {
    // a path that is gone compares as written
  }
  return process.platform === "win32" ? real.toLowerCase() : real;
};
const sameDir = (a: string, b: string): boolean => canonical(a) === canonical(b);

/**
 * What the Explorer reads of a project's worktrees: which worktree a selection shows, a directory's entries, a
 * file's text, and what changed since the worktree's base. Every path from the renderer is checked: the root must be
 * a worktree git lists, and a path must stay inside it.
 */
export function createExplorer(
  runner: ProcessRunner,
  projectPath: string,
  limits: { maxEntries?: number; maxFileBytes?: number } = {},
) {
  const maxEntries = limits.maxEntries ?? MAX_ENTRIES;
  const maxFileBytes = limits.maxFileBytes ?? MAX_FILE_BYTES;

  const git = async (cwd: string, args: string[]): Promise<{ ok: boolean; stdout: string }> => {
    const result = await runner.run("git", ["--no-optional-locks", ...args], { cwd });
    return { ok: result.exitCode === 0, stdout: result.stdout };
  };

  async function toRoot(
    mainCheckout: string,
    entry: { path: string; branch: string | null; main: boolean; link: { ticket: string | null } },
  ): Promise<ExplorerRoot> {
    // The main checkout shows its uncommitted changes; a worktree, everything since it left the default branch.
    let base: string | null = null;
    if (!entry.main) {
      const branch = await defaultBranch(runner, mainCheckout);
      const mergeBase = branch === null ? null : await git(entry.path, ["merge-base", "HEAD", branch]);
      if (mergeBase?.ok) base = mergeBase.stdout.trim();
    }
    return { path: entry.path, branch: entry.branch, main: entry.main, ticket: entry.link.ticket, base };
  }

  async function resolveRoot(hint: RootHint): Promise<ExplorerRoot> {
    const mainCheckout = await findMainCheckout(runner, projectPath);
    const entries = await listWorktrees(runner, mainCheckout);
    const main = entries.find((entry) => entry.main) ?? entries[0];
    if (main === undefined) throw new DrylandError("git lists no worktree here.", "opening the project's folder");
    let chosen = main;
    if (hint?.kind === "worktree") {
      chosen = entries.find((entry) => sameDir(entry.path, hint.path)) ?? main;
    } else if (hint?.kind === "ticket") {
      const ref = ticketRef(hint.ticket);
      chosen = entries.find((entry) => entry.link.kind === "name" && entry.link.ticket === ref) ?? main;
    }
    return toRoot(mainCheckout, chosen);
  }

  async function knownRoot(root: string): Promise<ExplorerRoot> {
    const mainCheckout = await findMainCheckout(runner, projectPath);
    const entry = (await listWorktrees(runner, mainCheckout)).find((e) => sameDir(e.path, root));
    if (entry === undefined) throw new DrylandError(`${root} is not a worktree of this project.`, "picking a worktree");
    return toRoot(mainCheckout, entry);
  }

  /** The absolute path of `path` inside `root`, refusing anything that leaves it, symlinks included. */
  async function inside(root: string, path: string): Promise<string> {
    const refuse = () => new DrylandError(`${path} is outside the worktree.`, "picking a file inside it");
    if (!isRelativeInside(path)) throw refuse();
    const absolute = join(root, path);
    const from = relative(canonical(root), canonical(absolute));
    if (from.startsWith("..") || isAbsolute(from)) throw refuse();
    return absolute;
  }

  /** Ignored top-level entries of `dir`, as `git` sees them; a directory is listed whole, never descended into. */
  async function ignoredIn(root: string, dir: string): Promise<Set<string>> {
    const spec = dir === "" ? "." : dir;
    const { ok, stdout } = await git(root, [
      "ls-files",
      "--others",
      "--ignored",
      "--exclude-standard",
      "--directory",
      "-z",
      "--",
      spec,
    ]);
    if (!ok) return new Set();
    return new Set(
      stdout
        .split("\0")
        .filter(Boolean)
        .map((p) => p.replace(/\/$/, "")),
    );
  }

  async function listDirectory(root: string, dir: string): Promise<DirectoryListing> {
    await knownRoot(root);
    const absolute = await inside(root, dir);
    const dirents = await readdir(absolute, { withFileTypes: true }).catch(() => []);
    const ignored = await ignoredIn(root, dir);
    const entries = dirents
      .filter((d) => d.name !== ".git")
      .map((d) => {
        const path = dir === "" ? d.name : `${dir}/${d.name}`;
        return {
          name: d.name,
          path,
          kind: d.isDirectory() ? ("dir" as const) : ("file" as const),
          ignored: ignored.has(path),
        };
      })
      .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "dir" ? -1 : 1));
    return { entries: entries.slice(0, maxEntries), truncated: entries.length > maxEntries };
  }

  async function readFile(root: string, path: string): Promise<FileContent> {
    await knownRoot(root);
    const absolute = await inside(root, path);
    let handle;
    try {
      handle = await open(absolute, "r");
    } catch {
      return { kind: "missing" };
    }
    try {
      const { size } = await handle.stat();
      const buffer = Buffer.alloc(Math.min(size, maxFileBytes + 1));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      const bytes = buffer.subarray(0, bytesRead);
      if (bytes.subarray(0, BINARY_SNIFF_BYTES).includes(0)) return { kind: "binary" };
      const truncated = bytes.length > maxFileBytes;
      return {
        kind: "text",
        text: bytes.subarray(0, truncated ? utf8Boundary(bytes, maxFileBytes) : bytes.length).toString("utf8"),
        truncated,
      };
    } catch {
      return { kind: "missing" };
    } finally {
      await handle.close();
    }
  }

  async function changes(root: string): Promise<ChangedFile[]> {
    const { base } = await knownRoot(root);
    const diff = await git(root, ["diff", "--name-status", "--no-renames", "-z", base ?? "HEAD"]);
    const changed = new Map<string, ChangeStatus>();
    const parts = diff.ok ? diff.stdout.split("\0").filter(Boolean) : [];
    for (let i = 0; i + 1 < parts.length; i += 2) changed.set(parts[i + 1]!, STATUS[parts[i]![0]!] ?? "modified");
    const untracked = await git(root, ["ls-files", "--others", "--exclude-standard", "-z"]);
    for (const path of untracked.ok ? untracked.stdout.split("\0").filter(Boolean) : []) changed.set(path, "untracked");
    return [...changed].map(([path, status]) => ({ path, status })).sort((a, b) => a.path.localeCompare(b.path));
  }

  async function diff(root: string, path: string): Promise<DiffContent> {
    const { base } = await knownRoot(root);
    await inside(root, path);
    const tracked = await git(root, [
      "diff",
      "--no-color",
      "--no-ext-diff",
      "--no-renames",
      base ?? "HEAD",
      "--",
      path,
    ]);
    if (tracked.ok && tracked.stdout !== "") {
      return BINARY_DIFF.test(tracked.stdout)
        ? { kind: "binary" }
        : { kind: "text", text: tracked.stdout, truncated: false };
    }
    // Git has no diff for a file it does not track yet: show all of it as added.
    const content = await readFile(root, path);
    if (content.kind === "binary") return { kind: "binary" };
    if (content.kind !== "text" || content.text === "") return { kind: "text", text: "", truncated: false };
    const lines = content.text.replace(/\n$/, "").split("\n");
    const noFinalNewline = !content.truncated && !content.text.endsWith("\n");
    const rows = [`@@ -0,0 +1,${lines.length} @@`, ...lines.map((line) => `+${line}`)];
    if (noFinalNewline) rows.push("\\ No newline at end of file");
    return { kind: "text", text: rows.join("\n"), truncated: content.truncated };
  }

  /**
   * Checks what the renderer asks to watch (a worktree of the project, directories inside it) and returns the
   * worktree's git directory, whose HEAD and index change on a commit.
   */
  async function watchTarget(root: string, dirs: readonly string[]): Promise<string | null> {
    if (!dirs.every(isRelativeInside)) {
      throw new DrylandError("A directory to watch is outside the worktree.", "watching directories inside it");
    }
    return gitDir(root);
  }

  /** The directory git keeps this worktree's HEAD and index in; a linked worktree has its own. */
  async function gitDir(root: string): Promise<string | null> {
    await knownRoot(root);
    const { ok, stdout } = await git(root, ["rev-parse", "--absolute-git-dir"]);
    return ok ? stdout.trim() : null;
  }

  return { resolveRoot, watchTarget, listDirectory, readFile, changes, diff };
}

const ticketRef = (ticket: TicketRef): string => `${ticket.map}/${ticket.id}`;
