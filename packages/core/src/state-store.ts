import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DrylandError, requireOneLine } from "./errors.ts";
import { assertMapName } from "./map.ts";
import { TICKET_TYPES, TRIAGE_ROLES, type Ticket, type TicketType, type TriageRole } from "./ticket.ts";

/** The ref holding the event log. It is never checked out, so no worktree or container mount contains it. */
export const STATE_REF = "refs/dryland/state";

/** Who wrote an event: a person, an agent in a session, or the engine itself. */
export type AuthorKind = "human" | "agent" | "engine";

interface TicketCreated {
  kind: "ticket.created";
  map: string;
  id: string;
  title: string;
  type: TicketType;
  report: string;
  blockedBy: string[];
  triageRole: TriageRole | null;
}

/** An immutable record of one change, stored as one file of the state ref. */
export type StateEvent = TicketCreated & { at: string; author: AuthorKind };

interface GitResult {
  stdout: string;
  exitCode: number;
}

/** Runs `git` with optional stdin and env; never rejects on a non-zero exit. Output is bytes so blobs survive. */
function runGit(cwd: string, args: string[], opts: { input?: string; env?: Record<string, string> } = {}) {
  return new Promise<GitResult & { raw: Buffer; stderr: string }>((resolve, reject) => {
    const child = spawn("git", args, { cwd, env: { ...process.env, ...opts.env }, windowsHide: true });
    const out: Buffer[] = [];
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    child.on("error", reject);
    child.on("close", (code) => {
      const raw = Buffer.concat(out);
      resolve({ stdout: raw.toString("utf8"), raw, stderr, exitCode: code ?? 1 });
    });
    child.stdin.end(opts.input ?? "");
  });
}

async function gitOk(cwd: string, args: string[], opts?: { input?: string; env?: Record<string, string> }) {
  const result = await runGit(cwd, args, opts);
  if (result.exitCode !== 0) {
    throw new DrylandError(
      `git ${args[0] ?? ""} failed: ${result.stderr.trim() || "no output"}`,
      "Run dryland from inside a git repository.",
    );
  }
  return result.stdout.trim();
}

async function commonDir(cwd: string): Promise<string> {
  return gitOk(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
}

/** The commit the state ref points at, or `null` when the repo has no state store. */
async function stateHead(cwd: string): Promise<string | null> {
  const result = await runGit(cwd, ["rev-parse", "--verify", "--quiet", STATE_REF]);
  return result.exitCode === 0 ? result.stdout.trim() : null;
}

/** Whether the repo containing `cwd` keeps its tickets in the state store. */
export async function isStoreInitialised(cwd: string): Promise<boolean> {
  return (await stateHead(cwd).catch(() => null)) !== null;
}

const AUTHOR_ENV = {
  GIT_AUTHOR_NAME: "Dryland",
  GIT_AUTHOR_EMAIL: "dryland@localhost",
  GIT_COMMITTER_NAME: "Dryland",
  GIT_COMMITTER_EMAIL: "dryland@localhost",
};

/** Creates the state ref with an empty tree. Does nothing, and says so, when it already exists. */
export async function initStore(cwd: string): Promise<{ created: boolean }> {
  if ((await stateHead(cwd)) !== null) return { created: false };
  const tree = await gitOk(cwd, ["mktree"]);
  const commit = await gitOk(cwd, ["commit-tree", tree, "-m", "Initialise the Dryland state store"], {
    env: AUTHOR_ENV,
  });
  const zero = "0".repeat(commit.length);
  const result = await runGit(cwd, ["update-ref", STATE_REF, commit, zero]);
  // A concurrent init that won the race leaves the same result.
  if (result.exitCode !== 0 && (await stateHead(cwd)) === null) {
    throw new DrylandError(`Could not create ${STATE_REF}: ${result.stderr.trim()}`, "Check the repo is writable.");
  }
  return { created: true };
}

/** Every event of the commit `head`, oldest first. */
async function replayEvents(cwd: string, head: string): Promise<StateEvent[]> {
  const listing = await gitOk(cwd, ["ls-tree", "-r", head]);
  const files = listing
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => {
      const [meta = "", path = ""] = line.split("\t");
      return { sha: meta.split(" ")[2] ?? "", path };
    })
    .filter((f) => f.path.startsWith("events/"))
    .sort((a, b) => a.path.localeCompare(b.path));
  if (files.length === 0) return [];
  const batch = await runGit(cwd, ["cat-file", "--batch"], { input: files.map((f) => `${f.sha}\n`).join("") });
  const events: StateEvent[] = [];
  let offset = 0;
  for (let i = 0; i < files.length; i++) {
    const newline = batch.raw.indexOf(0x0a, offset);
    const size = Number(batch.raw.subarray(offset, newline).toString("utf8").split(" ")[2]);
    const start = newline + 1;
    events.push(JSON.parse(batch.raw.subarray(start, start + size).toString("utf8")) as StateEvent);
    offset = start + size + 1;
  }
  return events;
}

const padId = (n: number) => String(n).padStart(2, "0");

/** The tickets the events add up to. */
function reduce(events: StateEvent[]): Ticket[] {
  const tickets: Ticket[] = [];
  for (const event of events) {
    if (event.kind === "ticket.created") {
      tickets.push({
        id: event.id,
        map: event.map,
        title: event.title,
        type: event.type,
        state: "open",
        claimant: null,
        blockers: event.blockedBy,
        triageRole: event.triageRole,
        body: event.report,
        answer: null,
        comments: [],
        raw: {},
      });
    }
  }
  return tickets;
}

async function cachePath(cwd: string): Promise<string> {
  return join(await commonDir(cwd), "dryland", "cache.sqlite");
}

/** Reads the cache for `head`, or `null` when it is missing, stale or unreadable. */
function readCache(path: string, head: string): Ticket[] | null {
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(path, { readOnly: true });
    const meta = db.prepare("SELECT value FROM meta WHERE key = 'head'").get() as { value: string } | undefined;
    if (meta?.value !== head) return null;
    const rows = db.prepare("SELECT json FROM tickets ORDER BY map, id").all() as { json: string }[];
    return rows.map((row) => JSON.parse(row.json) as Ticket);
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

function writeCache(path: string, head: string, tickets: Ticket[]): void {
  const db = new DatabaseSync(path);
  try {
    db.exec("BEGIN");
    db.exec("DROP TABLE IF EXISTS meta; DROP TABLE IF EXISTS tickets");
    db.exec("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    db.exec("CREATE TABLE tickets (map TEXT NOT NULL, id TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY (map, id))");
    const insert = db.prepare("INSERT INTO tickets (map, id, json) VALUES (?, ?, ?)");
    for (const t of tickets) insert.run(t.map, t.id, JSON.stringify(t));
    db.prepare("INSERT INTO meta (key, value) VALUES ('head', ?)").run(head);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.close();
  }
}

/** Every ticket in the store, from the cache when it matches the ref and by replay (rebuilding it) when not. */
export async function readStoreTickets(cwd: string): Promise<Ticket[]> {
  const head = await stateHead(cwd);
  if (head === null) throw notInitialised();
  const path = await cachePath(cwd);
  const cached = readCache(path, head);
  if (cached !== null) return cached;
  const tickets = reduce(await replayEvents(cwd, head));
  // The cache is disposable: failing to write it only costs the next read a replay.
  try {
    await mkdir(join(path, ".."), { recursive: true });
    await rm(path, { force: true });
    writeCache(path, head, tickets);
  } catch {
    // ignored
  }
  return tickets;
}

const notInitialised = () =>
  new DrylandError("This repo has no Dryland state store.", "Run `dryland init` to create one.");

export interface CreateStoreTicketInput {
  map: string;
  title: string;
  type: string;
  question?: string;
  blockedBy?: string[];
  /** A triage role to start in. */
  status?: string;
}

const MAX_ATTEMPTS = 8;

/**
 * Appends a `ticket.created` event as one compare-and-set on the state ref: the ticket number is chosen from the
 * state at the parent commit, and a lost race retries against the newer state.
 */
export async function createStoreTicket(
  cwd: string,
  input: CreateStoreTicketInput,
  author: AuthorKind,
): Promise<Ticket> {
  assertMapName(input.map);
  const title = requireOneLine("ticket title", input.title, "title", "<short title>");
  const type = TICKET_TYPES.find((known) => known === input.type.toLowerCase());
  if (type === undefined) {
    throw new DrylandError(
      `"${input.type}" is not a ticket type.`,
      `Use --type with one of: ${TICKET_TYPES.join(", ")}.`,
    );
  }
  const role = input.status === undefined ? null : TRIAGE_ROLES.find((known) => known === input.status);
  if (role === undefined) {
    throw new DrylandError(`"${input.status}" is not a triage role.`, `Use one of: ${TRIAGE_ROLES.join(", ")}.`);
  }
  const scratch = await mkdtemp(join(tmpdir(), "dryland-state-"));
  try {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const head = await stateHead(cwd);
      if (head === null) throw notInitialised();
      const events = await replayEvents(cwd, head);
      const own = reduce(events).filter((t) => t.map === input.map);
      const blockedBy = (input.blockedBy ?? []).map((n) => padId(Number(n)));
      for (const blocker of blockedBy) {
        if (!own.some((t) => t.id === blocker)) {
          throw new DrylandError(
            `Blocker ${input.map}/${blocker} does not exist.`,
            "Name tickets of the same map, or create the blocker first.",
          );
        }
      }
      const id = padId(own.reduce((max, t) => Math.max(max, Number(t.id)), 0) + 1);
      const event: StateEvent = {
        kind: "ticket.created",
        at: new Date().toISOString(),
        author,
        map: input.map,
        id,
        title,
        type,
        report: input.question?.trim() ?? "",
        blockedBy,
        triageRole: role,
      };
      const name = `events/${String(events.length + 1).padStart(8, "0")}-${randomUUID()}.json`;
      const blob = await gitOk(cwd, ["hash-object", "-w", "--stdin"], { input: `${JSON.stringify(event)}\n` });
      const env = { ...AUTHOR_ENV, GIT_INDEX_FILE: join(scratch, "index") };
      await rm(env.GIT_INDEX_FILE, { force: true });
      await gitOk(cwd, ["read-tree", head], { env });
      await gitOk(cwd, ["update-index", "--add", "--cacheinfo", `100644,${blob},${name}`], { env });
      const tree = await gitOk(cwd, ["write-tree"], { env });
      const commit = await gitOk(cwd, ["commit-tree", tree, "-p", head, "-m", `ticket.created ${input.map}/${id}`], {
        env,
      });
      if ((await runGit(cwd, ["update-ref", STATE_REF, commit, head])).exitCode === 0) {
        return reduce([event])[0] as Ticket;
      }
    }
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
  throw new DrylandError("The state store kept changing underneath this command.", "Run it again.");
}
