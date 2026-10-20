import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { exists } from "./env-fs.ts";
import { DrylandError, requireOneLine } from "./errors.ts";
import { ticketFile } from "./local-markdown.ts";
import { findMainCheckout } from "./main-checkout.ts";
import type { WorktreeGitState } from "./next-step.ts";
import type { ProcessRunner } from "./process-runner.ts";
import type { Ticket } from "./ticket.ts";
import { findTicket, parseTicketReference, readTickets } from "./tickets.ts";
import { defaultBranch } from "./tracker-write.ts";

/** The commit trailer that ties a branch to a ticket when its name does not: `Dryland-Ticket: <map>/<NN>`. */
export const TICKET_TRAILER = "Dryland-Ticket";

export type WorktreeLink =
  /** Tied to its ticket by the `<map>/<NN>-<slug>` branch name. */
  | { kind: "name"; ticket: string }
  /** Tied to its ticket by a commit trailer only. */
  | { kind: "trailer"; ticket: string }
  /** Made by dryland without a ticket: `<map>/scratch-<slug>`. */
  | { kind: "scratch"; ticket: null }
  /** An Unlinked branch: neither name nor trailer ties it to a ticket. */
  | { kind: "unlinked"; ticket: null };

export interface WorktreeEntry {
  path: string;
  /** `null` for a detached HEAD. */
  branch: string | null;
  head: string;
  /** The main checkout, which is never pruned. */
  main: boolean;
  link: WorktreeLink;
}

export interface WorktreeResult {
  branch: string;
  path: string;
  /** `<map>/<NN>` of the ticket the worktree is for; `null` for a scratch worktree. */
  ticket: string | null;
}

const TICKET_BRANCH = /^([^/]+)\/(\d+)-.+$/;
const SCRATCH_BRANCH = /^[^/]+\/scratch-.+$/;
const SLUG_MAX = 40;

/** Lowercase ASCII words joined by `-`; `""` when nothing usable is left. */
export function slugify(text: string): string {
  const slug = text
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, SLUG_MAX).replace(/-+$/, "");
}

export async function gitIn(runner: ProcessRunner, cwd: string, args: string[], what: string): Promise<string> {
  const result = await runner.run("git", args, { cwd });
  if (result.exitCode !== 0) {
    throw new DrylandError(
      `git ${args[0]} failed while ${what}: ${(result.stderr || result.stdout).trim()}`,
      "Fix the cause and run the command again.",
    );
  }
  return result.stdout;
}

/** Where worktrees go: a sibling of the main checkout, so no worktree sits inside another. */
function worktreesDir(mainCheckout: string): string {
  return join(dirname(mainCheckout), `${basename(mainCheckout)}.worktrees`);
}

export interface CreateWorktreeOptions {
  /** `<map>/<NN>` of the ticket to work on; omit for a scratch worktree. */
  ticket?: string;
  /** The effort for a scratch worktree; a ticket brings its own. */
  map?: string;
  /** The name part of a scratch worktree. */
  slug?: string;
}

/** Creates one worktree and branch for a ticket (`<map>/<NN>-<slug>`) or for scratch work (`<map>/scratch-<slug>`). */
export async function createWorktree(
  runner: ProcessRunner,
  cwd: string,
  options: CreateWorktreeOptions,
): Promise<WorktreeResult> {
  const mainCheckout = await findMainCheckout(runner, cwd);

  let base: string;
  let ticket: string | null = null;
  if (options.ticket !== undefined) {
    if (options.slug !== undefined) {
      throw new DrylandError(
        "--slug names a scratch worktree, but a ticket was given and it names its own worktree.",
        "Drop --slug, or drop the ticket and pass --map <map> for a scratch worktree.",
      );
    }
    const found = findTicket(await readTickets(mainCheckout), parseTicketReference(options.ticket));
    const file = await ticketFile(mainCheckout, found.map, found.id);
    const stem = basename(file ?? "", ".md").replace(/^\d+-/, "");
    base = `${found.map}/${found.id}-${slugify(stem) || slugify(found.title) || "ticket"}`;
    ticket = `${found.map}/${found.id}`;
  } else {
    if (options.map === undefined) {
      throw new DrylandError(
        "A worktree without a ticket needs a map to name it after.",
        "Pass --map <map>, or name a ticket as <map>/<number>.",
      );
    }
    const map = requireOneLine("map", options.map, "map", "<map>");
    const slug = slugify(options.slug ?? "") || "work";
    base = `${map}/scratch-${slug}`;
  }

  const startPoint = await defaultBranch(runner, mainCheckout);
  // The first free name: neither the branch nor the directory may exist already.
  for (let n = 1; ; n++) {
    const branch = n === 1 ? base : `${base}-${n}`;
    const path = join(worktreesDir(mainCheckout), branch.replaceAll("/", "-"));
    const taken = await runner.run("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], {
      cwd: mainCheckout,
    });
    if (taken.exitCode === 0 || (await exists(path))) continue;
    // Start from the default branch, the base prune compares against, whatever the main checkout has checked out.
    const start = startPoint === null ? [] : [startPoint];
    await gitIn(
      runner,
      mainCheckout,
      ["worktree", "add", "--quiet", "-b", branch, path, ...start],
      `creating ${branch}`,
    );
    return { branch, path, ticket };
  }
}

/**
 * The ticket's Linked worktree, named after it, when one is still on disk; otherwise a new one. Starting work
 * again on a ticket so lands where the earlier work is.
 */
export async function worktreeForTicket(
  runner: ProcessRunner,
  cwd: string,
  ticket: string,
): Promise<WorktreeResult & { reused: boolean }> {
  const mainCheckout = await findMainCheckout(runner, cwd);
  const { entries, tickets } = await snapshotWorktrees(runner, mainCheckout);
  const found = findTicket(tickets, parseTicketReference(ticket));
  const ref = `${found.map}/${found.id}`;
  for (const entry of entries) {
    if (entry.link.kind !== "name" || entry.link.ticket !== ref || entry.branch === null) continue;
    if (await exists(entry.path)) return { branch: entry.branch, path: entry.path, ticket: ref, reused: true };
  }
  return { ...(await createWorktree(runner, mainCheckout, { ticket: ref })), reused: false };
}

/**
 * The scratch worktree `<map>/scratch-<slug>` when it is still on disk; otherwise a new one, collision-suffixed. A
 * map's own session so goes back to the worktree its earlier sessions used.
 */
export async function worktreeForScratch(
  runner: ProcessRunner,
  cwd: string,
  map: string,
  slug: string,
): Promise<WorktreeResult & { reused: boolean }> {
  const mainCheckout = await findMainCheckout(runner, cwd);
  const branch = `${map}/scratch-${slugify(slug) || "work"}`;
  const found = (await gitWorktrees(runner, mainCheckout)).find((entry) => entry.branch === branch);
  if (found !== undefined && (await exists(found.path))) {
    return { branch, path: found.path, ticket: null, reused: true };
  }
  return { ...(await createWorktree(runner, mainCheckout, { map, slug })), reused: false };
}

interface RawWorktree {
  path: string;
  branch: string | null;
  head: string;
}

async function gitWorktrees(runner: ProcessRunner, mainCheckout: string): Promise<RawWorktree[]> {
  const out = await gitIn(runner, mainCheckout, ["worktree", "list", "--porcelain"], "listing worktrees");
  const entries: RawWorktree[] = [];
  for (const block of out.replace(/\r\n/g, "\n").split("\n\n")) {
    const lines = block.split("\n");
    const path = lines.find((l) => l.startsWith("worktree "))?.slice("worktree ".length);
    if (path === undefined || lines.includes("bare")) continue;
    const ref = lines.find((l) => l.startsWith("branch "))?.slice("branch ".length);
    entries.push({
      path: resolve(path),
      branch: ref?.replace(/^refs\/heads\//, "") ?? null,
      head: lines.find((l) => l.startsWith("HEAD "))?.slice("HEAD ".length) ?? "",
    });
  }
  return entries;
}

/** The ticket a commit trailer on the branch's own commits names, when it is a real ticket. */
async function trailerTicket(
  runner: ProcessRunner,
  mainCheckout: string,
  branch: string,
  base: string,
  tickets: Ticket[],
): Promise<string | null> {
  const log = await runner.run(
    "git",
    ["log", `--format=%(trailers:key=${TICKET_TRAILER},valueonly)`, branch, "--not", base],
    { cwd: mainCheckout },
  );
  if (log.exitCode !== 0) return null;
  for (const line of log.stdout.split(/\r?\n/)) {
    const value = line.trim();
    if (value === "") continue;
    try {
      const wanted = parseTicketReference(value);
      if (wanted.map === null) continue;
      const found = findTicketByNumber(tickets, wanted.map, wanted.number);
      if (found !== undefined) return `${found.map}/${found.id}`;
    } catch {
      // A trailer that is not a ticket reference links nothing.
    }
  }
  return null;
}

/** The ticket `map` holds under number `number`, if any. */
function findTicketByNumber(tickets: Ticket[], map: string, number: number): Ticket | undefined {
  return tickets.find((t) => t.map === map && Number(t.id) === number);
}

function linkByName(branch: string, tickets: Ticket[]): WorktreeLink | null {
  const match = TICKET_BRANCH.exec(branch);
  if (match?.[1] !== undefined && match[2] !== undefined) {
    const [, map, number] = match;
    const found = findTicketByNumber(tickets, map, Number(number));
    if (found !== undefined) return { kind: "name", ticket: `${found.map}/${found.id}` };
  }
  return SCRATCH_BRANCH.test(branch) ? { kind: "scratch", ticket: null } : null;
}

interface WorktreeSnapshot {
  entries: WorktreeEntry[];
  tickets: Ticket[];
  /** What branches are compared against: the default branch, or `HEAD` when the repo has none. */
  base: string;
}

/** Reads the worktrees, tickets and default branch once, and links each worktree to its ticket. */
async function snapshotWorktrees(
  runner: ProcessRunner,
  mainCheckout: string,
  known?: Ticket[],
): Promise<WorktreeSnapshot> {
  const [raw, tickets, defaultName] = await Promise.all([
    gitWorktrees(runner, mainCheckout),
    known ?? readTickets(mainCheckout),
    defaultBranch(runner, mainCheckout),
  ]);
  const base = defaultName ?? "HEAD";
  const main = resolve(mainCheckout);

  const entries: WorktreeEntry[] = [];
  for (const worktree of raw) {
    const isMain = worktree.path === main;
    let link: WorktreeLink = { kind: "unlinked", ticket: null };
    if (!isMain && worktree.branch !== null) {
      link = linkByName(worktree.branch, tickets) ?? link;
      if (link.kind === "unlinked") {
        const ticket = await trailerTicket(runner, mainCheckout, worktree.branch, base, tickets);
        if (ticket !== null) link = { kind: "trailer", ticket };
      }
    }
    entries.push({ ...worktree, main: isMain, link });
  }
  return { entries, tickets, base };
}

/** Every worktree of the repo containing `cwd`, each with the ticket it links to. */
export async function listWorktrees(runner: ProcessRunner, cwd: string): Promise<WorktreeEntry[]> {
  return (await snapshotWorktrees(runner, await findMainCheckout(runner, cwd))).entries;
}

/**
 * The worktree of the repo containing `repo` that holds directory `cwd`, the innermost when worktrees nest; `null`
 * when `cwd` is in none of them. This links a session started by hand to its ticket by working directory.
 */
export async function worktreeAt(runner: ProcessRunner, repo: string, cwd: string): Promise<WorktreeEntry | null> {
  const target = resolve(cwd);
  const holding = (await listWorktrees(runner, repo)).filter((entry) => {
    const rel = relative(entry.path, target);
    return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  });
  return holding.sort((a, b) => b.path.length - a.path.length)[0] ?? null;
}

/** What git says about one ticket's Linked worktrees, folded into one entry per ticket. */
export type TicketWorktreeState = Omit<WorktreeGitState, "prExists">;

async function revision(runner: ProcessRunner, cwd: string, ref: string): Promise<string | null> {
  const result = await runner.run("git", ["rev-parse", "--verify", "--quiet", ref], { cwd });
  return result.exitCode === 0 ? result.stdout.trim() : null;
}

/**
 * The git state of every ticket-linked worktree that is still on disk, folded to one entry per ticket. A
 * branch counts as merged when it carries no commits the default branch lacks and its tip is not the commit
 * the branch was created at (the oldest reflog entry), i.e. it once had work and that work is now in. Squash
 * merges are not seen, and a branch reset backwards reads as merged. Returns `null` when git cannot say (not a
 * repo, no default branch to compare against, a failed comparison), so callers treat the state as unknown
 * rather than empty.
 */
export async function readTicketWorktreeStates(
  runner: ProcessRunner,
  mainCheckout: string,
  tickets: Ticket[],
): Promise<TicketWorktreeState[] | null> {
  let snapshot: WorktreeSnapshot;
  try {
    snapshot = await snapshotWorktrees(runner, mainCheckout, tickets);
  } catch (error) {
    if (error instanceof DrylandError) return null;
    throw error;
  }
  const { entries, base } = snapshot;
  // `HEAD` is the fallback when the repo has no default branch; comparing against it would call nothing ahead.
  if (base === "HEAD") return null;
  const byTicket = new Map<string, TicketWorktreeState>();
  for (const entry of entries) {
    if (entry.main || entry.branch === null || entry.link.ticket === null) continue;
    if (!(await exists(entry.path))) continue;
    const ref = `refs/heads/${entry.branch}`;
    const count = await runner.run("git", ["rev-list", "--count", `${base}..${ref}`], { cwd: mainCheckout });
    if (count.exitCode !== 0) return null;
    const ahead = Number(count.stdout.trim()) > 0;
    let merged = false;
    if (!ahead) {
      const tip = await revision(runner, mainCheckout, ref);
      const reflog = await runner.run("git", ["reflog", "show", "--format=%H", ref], { cwd: mainCheckout });
      const createdAt = reflog.exitCode === 0 ? (reflog.stdout.trim().split(/\r?\n/).at(-1) ?? "") : "";
      merged = tip !== null && createdAt !== "" && tip !== createdAt;
    }
    const previous = byTicket.get(entry.link.ticket);
    const [map = "", id = ""] = entry.link.ticket.split("/");
    byTicket.set(entry.link.ticket, {
      map,
      id,
      exists: true,
      branches: [...(previous?.branches ?? []), entry.branch],
      aheadOfDefault: (previous?.aheadOfDefault ?? false) || ahead,
      merged: previous === undefined ? merged : previous.merged && merged,
    });
  }
  return [...byTicket.values()];
}

export interface PruneResult extends WorktreeResult {
  /** `false` when every condition held but the caller had not confirmed, so nothing was touched. */
  removed: boolean;
}

export interface PruneOptions {
  /** The caller's confirmation; without it nothing is removed. */
  yes: boolean;
  /** Whether a live session is attached to the worktree; the app supplies this, the CLI takes a flag. */
  sessionAttached: boolean;
}

/**
 * Removes a worktree and its branch only if the ticket is resolved, the branch merged or empty, the tree clean
 * and no session attached, and the caller confirmed. Fails naming every condition that does not hold.
 */
export async function pruneWorktree(
  runner: ProcessRunner,
  cwd: string,
  target: string,
  options: PruneOptions,
): Promise<PruneResult> {
  const mainCheckout = await findMainCheckout(runner, cwd);
  const { entries, tickets, base } = await snapshotWorktrees(runner, mainCheckout);
  const wanted = resolve(cwd, target);
  const entry = entries.find((e) => e.branch === target || e.path === wanted);
  if (entry === undefined) {
    throw new DrylandError(
      `There is no worktree on branch or at path "${target}".`,
      "Run `dryland worktree list` and name a branch from it.",
    );
  }
  if (entry.branch === null) {
    throw new DrylandError(
      `The worktree at ${entry.path} has a detached HEAD, so dryland cannot tell what to prune.`,
      "Remove it yourself with `git worktree remove` if it is no longer needed.",
    );
  }
  if (entry.main) {
    throw new DrylandError(`${entry.path} is the main checkout, which is never pruned.`, "Name a linked worktree.");
  }
  const { branch, path, link } = entry;
  if (link.kind === "unlinked") {
    throw new DrylandError(
      `Branch ${branch} is not linked to a ticket, so dryland will not prune it.`,
      `Remove it yourself with \`git worktree remove\` and \`git branch -d ${branch}\` if it is no longer needed.`,
    );
  }

  const failed: string[] = [];
  if (link.ticket !== null) {
    const ticket = findTicket(tickets, parseTicketReference(link.ticket));
    if (ticket.state !== "resolved") failed.push(`ticket ${link.ticket} is not resolved (it is ${ticket.state})`);
  }
  const ahead = await gitIn(runner, mainCheckout, ["rev-list", "--count", `${base}..${branch}`], "comparing branches");
  if (Number(ahead.trim()) > 0) {
    failed.push(`branch ${branch} has unmerged commits (${ahead.trim()} not in ${base})`);
  }
  const status = await gitIn(runner, path, ["status", "--porcelain"], "checking the worktree");
  if (status.trim() !== "") failed.push("the worktree has uncommitted changes");
  if (options.sessionAttached) failed.push("a session is attached to the worktree");

  if (failed.length > 0) {
    throw new DrylandError(
      `Will not prune ${branch}: ${failed.join("; ")}.`,
      "Clear what is listed, then run the command again.",
    );
  }
  if (!options.yes) return { branch, path, ticket: link.ticket, removed: false };

  await gitIn(runner, mainCheckout, ["worktree", "remove", path], `removing ${path}`);
  // Every condition above held, so the branch holds nothing the base does not; -D skips git's HEAD-relative check.
  await gitIn(runner, mainCheckout, ["branch", "-D", branch], `deleting ${branch}`);
  return { branch, path, ticket: link.ticket, removed: true };
}
