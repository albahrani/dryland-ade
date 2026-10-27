import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { type Diagnostic, parseDocument, WriteFailure } from "./documents.ts";
import { DrylandError } from "./errors.ts";
import { gitOk as gitOkIn, runGit as runGitIn } from "./git-exec.ts";
import { findMainCheckout } from "./main-checkout.ts";
import { assertMapName, type MapModel } from "./map.ts";
import { nodeProcessRunner } from "./process-runner.ts";
import { type BindOptions, bindStore, CopiedRepoError, storeDir } from "./store-dir.ts";
import { MAP_INPUT, TICKET_INPUT } from "./store-schemas.ts";
import type { Ticket, TicketState, TicketType, TriageRole } from "./ticket.ts";

/** The ref holding the event log. It is never checked out, and it lives in a bare git dir outside the repo. */
export const STATE_REF = "refs/dryland/state";

/** The version of the event format. An event of any other version fails loudly on replay. */
export const EVENT_SCHEMA = 1;

/** Who wrote an event: a person, an agent in a session, or the engine itself. */
export type AuthorKind = "human" | "agent" | "engine";

export interface StoreCriterion {
  text: string;
  done: boolean;
}

/** A ticket as the store holds it: every field it has at creation, plus the claim the lifecycle events set. */
export interface StoreTicket {
  effort: string;
  /** The ticket number within its effort, zero padded (`01`). */
  id: string;
  title: string;
  type: Exclude<TicketType, "none">;
  status: TicketState;
  report: string;
  criteria: StoreCriterion[];
  /** Repo-relative path of the effort's spec file, when the ticket names one. */
  spec: string | null;
  /** Ids of the tickets of the same effort that block this one. */
  blockedBy: string[];
  triageRole: TriageRole | null;
  hitl: boolean;
  /** Who holds the claim: the branch, so it outlives the session; the session that made it, when there was one. */
  claim: { holder: string; at: string; session: string | null } | null;
  /** What the resolution recorded; `null` while unresolved. */
  answer: string | null;
  comments: string[];
  createdAt: string;
}

/** An effort's map. An effort without one is a standalone ticket or a set of them. */
export interface StoreMap {
  effort: string;
  title: string;
  destination: string;
  notes: string;
  fog: string[];
  outOfScope: string[];
}

export interface StoreState {
  tickets: StoreTicket[];
  maps: StoreMap[];
}

interface TicketCreated {
  kind: "ticket.created";
  effort: string;
  id: string;
  title: string;
  type: StoreTicket["type"];
  report: string;
  criteria: StoreCriterion[];
  spec: string | null;
  blockedBy: string[];
  triageRole: TriageRole | null;
  hitl: boolean;
}

interface MapCreated extends StoreMap {
  kind: "map.created";
}

/** The changes a ticket goes through after it is created; each is one event naming the ticket it applies to. */
export type LifecycleChange =
  | { kind: "ticket.claimed"; holder: string; session: string | null }
  | { kind: "ticket.released" }
  | { kind: "ticket.resolved"; answer: string }
  | { kind: "ticket.answer-amended"; answer: string }
  | { kind: "ticket.ticked"; criterion: number }
  | { kind: "ticket.triaged"; role: TriageRole }
  | { kind: "ticket.blockers-changed"; blockedBy: string[] }
  | { kind: "ticket.commented"; text: string };

export type WithRef<T> = T extends unknown ? T & { effort: string; id: string } : never;

export type EventBody = TicketCreated | MapCreated | WithRef<LifecycleChange>;

/** An immutable record of one change, stored as one file of the state ref. */
export type StateEvent = EventBody & { schema: number; at: string; author: AuthorKind };

const AUTHOR_ENV = {
  GIT_AUTHOR_NAME: "Dryland",
  GIT_AUTHOR_EMAIL: "dryland@localhost",
  GIT_COMMITTER_NAME: "Dryland",
  GIT_COMMITTER_EMAIL: "dryland@localhost",
};

const notInitialised = () =>
  new DrylandError("This repo has no Dryland state store.", "Run `dryland init` to create one.");

/** A git runner pinned to the store dir with `GIT_DIR`, so it can never touch the repo's own refs. */
function inStore(dir: string) {
  const env = (extra?: Record<string, string>) => ({ GIT_DIR: dir, ...extra });
  return {
    run: (args: string[], opts: { input?: string; env?: Record<string, string> } = {}) =>
      runGitIn(dir, args, { ...opts, env: env(opts.env) }),
    ok: (args: string[], opts: { input?: string; env?: Record<string, string> } = {}) =>
      gitOkIn(dir, args, { ...opts, env: env(opts.env) }),
  };
}
type StoreGit = ReturnType<typeof inStore>;

/** The commit the state ref points at, or `null` when the store has none. */
async function stateHead(git: StoreGit): Promise<string | null> {
  const result = await git.run(["rev-parse", "--verify", "--quiet", STATE_REF]);
  return result.exitCode === 0 ? result.stdout.trim() : null;
}

/** A repo that is not in git has no store; a copied repo must not quietly fall back to markdown. */
function notCopied(error: unknown): null {
  if (error instanceof CopiedRepoError) throw error;
  return null;
}

/**
 * The error of a repo without a store. A directory that is no git repository, or a bare one, gets the error that says
 * so first, since `dryland init` cannot help there.
 */
async function noStore(cwd: string): Promise<never> {
  await findMainCheckout(nodeProcessRunner, cwd);
  throw notInitialised();
}

/** The store of the repo containing `cwd`, with its head; fails with the next action when there is none. */
async function openStore(cwd: string): Promise<{ dir: string; git: StoreGit; head: string }> {
  const dir = await storeDir(cwd).catch(notCopied);
  if (dir === null) return noStore(cwd);
  const git = inStore(dir);
  const head = await stateHead(git);
  if (head === null) throw notInitialised();
  return { dir, git, head };
}

/** Whether the repo containing `cwd` keeps its tickets in the state store. */
export async function isStoreInitialised(cwd: string): Promise<boolean> {
  const dir = await storeDir(cwd).catch(notCopied);
  return dir !== null && (await stateHead(inStore(dir))) !== null;
}

/**
 * Binds the repo to a store and creates the state ref with an empty tree. `bind` re-binds the repo to the existing
 * store of that id. Does nothing, and says so, when the store already has its ref.
 */
export async function initStore(cwd: string, opts: BindOptions = {}): Promise<{ created: boolean }> {
  const { dir } = await bindStore(cwd, opts);
  const git = inStore(dir);
  if ((await stateHead(git)) !== null) return { created: false };
  const tree = await git.ok(["mktree"]);
  const commit = await git.ok(["commit-tree", tree, "-m", "Initialise the Dryland state store"], { env: AUTHOR_ENV });
  const zero = "0".repeat(commit.length);
  const result = await git.run(["update-ref", STATE_REF, commit, zero]);
  // A concurrent init that won the race leaves the same result.
  if (result.exitCode !== 0 && (await stateHead(git)) === null) {
    throw new DrylandError(
      `Could not create ${STATE_REF}: ${result.stderr.trim()}`,
      "Check the store dir is writable.",
    );
  }
  return { created: true };
}

const EVENT_KINDS: ReadonlySet<string> = new Set([
  "ticket.created",
  "map.created",
  "ticket.claimed",
  "ticket.released",
  "ticket.resolved",
  "ticket.answer-amended",
  "ticket.ticked",
  "ticket.triaged",
  "ticket.blockers-changed",
  "ticket.commented",
] satisfies StateEvent["kind"][]);

/**
 * How many events pass between snapshots. A write that finds this many events past the latest snapshot adds a new one
 * in the same commit, so a replay reads at most this many events. `DRYLAND_SNAPSHOT_EVERY` overrides it for tests.
 */
const DEFAULT_SNAPSHOT_EVERY = 100;

function snapshotEvery(): number {
  const set = Number(process.env["DRYLAND_SNAPSHOT_EVERY"]);
  return Number.isInteger(set) && set > 0 ? set : DEFAULT_SNAPSHOT_EVERY;
}

interface TreeFile {
  sha: string;
  path: string;
}

/** The state after the first `upTo` events, kept in the ref as `snapshots/<upTo>.json`. */
interface Snapshot {
  schema: number;
  version: string;
  upTo: number;
  state: StoreState;
}

const sequenceOf = (path: string) => Number(/^(?:events|snapshots)\/(\d+)/.exec(path)?.[1]);

/** The blobs of `files`, in order. */
async function readBlobs(git: StoreGit, files: TreeFile[]): Promise<string[]> {
  if (files.length === 0) return [];
  const batch = await git.run(["cat-file", "--batch"], { input: files.map((f) => `${f.sha}\n`).join("") });
  const blobs: string[] = [];
  let offset = 0;
  for (let i = 0; i < files.length; i++) {
    const newline = batch.raw.indexOf(0x0a, offset);
    const size = Number(batch.raw.subarray(offset, newline).toString("utf8").split(" ")[2]);
    const start = newline + 1;
    blobs.push(batch.raw.subarray(start, start + size).toString("utf8"));
    offset = start + size + 1;
  }
  return blobs;
}

/** The newest snapshot that is readable, current and consistent; `null` when there is none. A bad one is skipped. */
async function latestSnapshot(git: StoreGit, snapshots: TreeFile[], eventCount: number): Promise<Snapshot | null> {
  for (const file of [...snapshots].sort((a, b) => b.path.localeCompare(a.path))) {
    const [text = ""] = await readBlobs(git, [file]);
    try {
      const snap = JSON.parse(text) as Snapshot;
      if (
        snap.schema === EVENT_SCHEMA &&
        snap.version === CACHE_VERSION &&
        snap.upTo === sequenceOf(file.path) &&
        snap.upTo <= eventCount &&
        Array.isArray(snap.state?.tickets) &&
        Array.isArray(snap.state?.maps)
      ) {
        return snap;
      }
    } catch {
      // A corrupt snapshot costs a longer replay, never the state.
    }
  }
  return null;
}

interface Replayed {
  state: StoreState;
  /** Events in the log, whether or not a snapshot covered them. */
  eventCount: number;
  /** Events replayed on top of the snapshot, `0` when the snapshot is current. */
  tail: number;
}

/**
 * The state at the commit `head`: the latest usable snapshot plus the events after it, or every event when there is
 * no snapshot. Only the events past the snapshot are read. An event of an unknown schema stops the replay.
 */
async function replayState(git: StoreGit, head: string): Promise<Replayed> {
  const listing = await git.ok(["ls-tree", "-r", head]);
  const all = listing
    .split("\n")
    .filter((line) => line !== "")
    .map((line): TreeFile => {
      const [meta = "", path = ""] = line.split("\t");
      return { sha: meta.split(" ")[2] ?? "", path };
    });
  const byPath = (a: TreeFile, b: TreeFile) => a.path.localeCompare(b.path);
  const eventFiles = all.filter((f) => f.path.startsWith("events/")).sort(byPath);
  const snapshot = await latestSnapshot(
    git,
    all.filter((f) => f.path.startsWith("snapshots/")),
    eventFiles.length,
  );
  const tail = eventFiles.filter((f) => sequenceOf(f.path) > (snapshot?.upTo ?? 0));
  const events = parseEvents(tail, await readBlobs(git, tail));
  return { state: reduce(events, snapshot?.state), eventCount: eventFiles.length, tail: events.length };
}

/** Parses the events of `files` (with their `blobs`), refusing an unknown schema or kind. */
function parseEvents(files: TreeFile[], blobs: string[]): StateEvent[] {
  const events: StateEvent[] = [];
  for (const [i, file] of files.entries()) {
    const event = JSON.parse(blobs[i] ?? "") as StateEvent;
    if (event.schema !== EVENT_SCHEMA) {
      throw new DrylandError(
        `Event ${file.path} has schema ${String(event.schema)}, but this Dryland reads schema ${EVENT_SCHEMA}.`,
        "Update Dryland, or re-create the store with `dryland init` if it was written by an older build.",
      );
    }
    if (!EVENT_KINDS.has(event.kind)) {
      throw new DrylandError(
        `Event ${file.path} has the unknown kind "${String((event as { kind?: unknown }).kind)}".`,
        "Update Dryland, or re-create the store with `dryland init` if it was written by an older build.",
      );
    }
    events.push(event);
  }
  return events;
}

const padId = (n: number) => String(n).padStart(2, "0");

/** Folds one lifecycle event into its ticket. */
function applyChange(ticket: StoreTicket, event: WithRef<LifecycleChange> & { at: string }): void {
  switch (event.kind) {
    case "ticket.claimed":
      ticket.status = "claimed";
      ticket.claim = { holder: event.holder, at: event.at, session: event.session };
      break;
    case "ticket.released":
      ticket.status = "open";
      ticket.claim = null;
      break;
    case "ticket.resolved":
      ticket.status = "resolved";
      ticket.claim = null;
      ticket.answer = event.answer;
      break;
    case "ticket.answer-amended":
      ticket.answer = event.answer;
      break;
    case "ticket.ticked": {
      const criterion = ticket.criteria[event.criterion - 1];
      if (criterion !== undefined) criterion.done = true;
      break;
    }
    case "ticket.triaged":
      ticket.triageRole = event.role;
      break;
    case "ticket.blockers-changed":
      ticket.blockedBy = event.blockedBy;
      break;
    case "ticket.commented":
      ticket.comments.push(event.text);
      break;
  }
}

/** The state the events add up to on top of `base` (not changed), or on an empty store. */
function reduce(events: StateEvent[], base?: StoreState): StoreState {
  const state: StoreState = base === undefined ? { tickets: [], maps: [] } : structuredClone(base);
  for (const event of events) {
    if (event.kind === "ticket.created") {
      state.tickets.push({
        effort: event.effort,
        id: event.id,
        title: event.title,
        type: event.type,
        status: "open",
        report: event.report,
        criteria: event.criteria.map((c) => ({ ...c })),
        spec: event.spec,
        blockedBy: [...event.blockedBy],
        triageRole: event.triageRole,
        hitl: event.hitl,
        claim: null,
        answer: null,
        comments: [],
        createdAt: event.at,
      });
    } else if (event.kind !== "map.created") {
      const ticket = state.tickets.find((t) => t.effort === event.effort && t.id === event.id);
      if (ticket !== undefined) applyChange(ticket, event);
    } else {
      state.maps.push({
        effort: event.effort,
        title: event.title,
        destination: event.destination,
        notes: event.notes,
        fog: event.fog,
        outOfScope: event.outOfScope,
      });
    }
  }
  state.tickets.sort((a, b) => a.effort.localeCompare(b.effort) || Number(a.id) - Number(b.id));
  return state;
}

/** Bumped when the cached shape changes, so an old cache is rebuilt rather than misread. */
const CACHE_VERSION = "3";

/** Reads the cache for `head`, or `null` when it is missing, stale or unreadable. */
function readCache(path: string, head: string): StoreState | null {
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(path, { readOnly: true });
    const rows = db.prepare("SELECT key, value FROM meta").all() as { key: string; value: string }[];
    const meta = new Map(rows.map((r) => [r.key, r.value]));
    if (meta.get("head") !== head || meta.get("version") !== CACHE_VERSION) return null;
    return JSON.parse(meta.get("state") ?? "null") as StoreState | null;
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

function writeCache(path: string, head: string, state: StoreState): void {
  const db = new DatabaseSync(path);
  try {
    db.exec("BEGIN");
    db.exec("DROP TABLE IF EXISTS meta");
    db.exec("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    const insert = db.prepare("INSERT INTO meta (key, value) VALUES (?, ?)");
    insert.run("head", head);
    insert.run("version", CACHE_VERSION);
    insert.run("state", JSON.stringify(state));
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.close();
  }
}

/** Everything in the store, from the cache when it matches the ref and by replay (rebuilding it) when not. */
export async function readStoreState(cwd: string): Promise<StoreState> {
  const { dir, git, head } = await openStore(cwd);
  const path = join(dir, "dryland", "cache.sqlite");
  const cached = readCache(path, head);
  if (cached !== null) return cached;
  const { state } = await replayState(git, head);
  // The cache is disposable: failing to write it only costs the next read a replay.
  try {
    await mkdir(join(path, ".."), { recursive: true });
    await rm(path, { force: true });
    writeCache(path, head, state);
  } catch {
    // ignored
  }
  return state;
}

/** A store ticket as the rest of the app sees tickets. */
export function toTicket(t: StoreTicket): Ticket {
  return {
    id: t.id,
    map: t.effort,
    title: t.title,
    type: t.type,
    state: t.status,
    claimant: t.claim?.holder ?? null,
    blockers: t.blockedBy,
    triageRole: t.triageRole,
    body: t.report,
    answer: t.answer,
    comments: t.comments,
    spec: t.spec,
    criteria: t.criteria,
  };
}

/** The first sentence of `text` on one line: up to the first `.`, `!` or `?` followed by a space or the end. */
export function firstSentence(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return /^.*?[.!?](?=\s|$)/.exec(flat)?.[0] ?? flat;
}

/**
 * An effort's Decisions so far: one line per resolved ticket, in ticket order, its title and the first sentence of its
 * summary. Derived on every read, so no one writes the list and it cannot drift from the tickets.
 */
export function decisionsOf(tickets: StoreTicket[], effort: string): string[] {
  return tickets
    .filter((t) => t.effort === effort && t.status === "resolved")
    .sort((a, b) => Number(a.id) - Number(b.id))
    .map((t) => {
      const gist = firstSentence(t.answer ?? "");
      return gist === "" ? t.title : `${t.title}: ${gist}`;
    });
}

/** A store map record as the map model the tree and the rules read, with Decisions so far derived from `tickets`. */
export function toMapModel(m: StoreMap, tickets: StoreTicket[]): MapModel {
  return {
    name: m.effort,
    title: m.title,
    destination: m.destination,
    fog: m.fog,
    decisions: decisionsOf(tickets, m.effort),
  };
}

/** The commit the state ref points at; `null` when the repo has no store. A cheap change signal for watchers. */
export async function readStoreHead(cwd: string): Promise<string | null> {
  const dir = await storeDir(cwd).catch(notCopied);
  return dir === null ? null : stateHead(inStore(dir));
}

/** Every ticket in the store. */
export async function readStoreTickets(cwd: string): Promise<Ticket[]> {
  return (await readStoreState(cwd)).tickets.map(toTicket);
}

export interface Plan {
  diagnostics: Diagnostic[];
  event: EventBody | null;
  /** The ref of what the event creates, for the commit message and the result. */
  subject: string;
}

export interface WriteOptions {
  author: AuthorKind;
  /** Stop after the check step: nothing is written. */
  checkOnly?: boolean;
}

const MAX_ATTEMPTS = 8;

/**
 * Runs a write: `plan` checks the document against the state at the head, and an event it returns is appended as one
 * compare-and-set on the state ref. A lost race plans again against the newer state, so a rule is never decided on
 * stale data. Returns the state after the event; for a check-only run that state is what the write would give.
 */
export async function writeToStore(
  cwd: string,
  plan: (state: StoreState) => Plan,
  opts: WriteOptions,
): Promise<{ state: StoreState; subject: string; written: boolean }> {
  const scratch = await mkdtemp(join(tmpdir(), "dryland-state-"));
  try {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const { git, head } = await openStore(cwd);
      const { state: current, eventCount, tail } = await replayState(git, head);
      const planned = plan(current);
      if (planned.diagnostics.length > 0) throw new WriteFailure("check", planned.diagnostics);
      // A plan with nothing to add, such as a claim its holder already has, writes nothing.
      if (planned.event === null) return { state: current, subject: planned.subject, written: false };
      const event: StateEvent = {
        schema: EVENT_SCHEMA,
        at: new Date().toISOString(),
        author: opts.author,
        ...planned.event,
      };
      const after = reduce([event], current);
      if (opts.checkOnly) return { state: after, subject: planned.subject, written: false };
      const seq = eventCount + 1;
      const name = `events/${String(seq).padStart(8, "0")}-${randomUUID()}.json`;
      const blob = await git.ok(["hash-object", "-w", "--stdin"], { input: `${JSON.stringify(event)}\n` });
      const env = { ...AUTHOR_ENV, GIT_INDEX_FILE: join(scratch, "index") };
      await rm(env.GIT_INDEX_FILE, { force: true });
      await git.ok(["read-tree", head], { env });
      await git.ok(["update-index", "--add", "--cacheinfo", `100644,${blob},${name}`], { env });
      if (tail + 1 >= snapshotEvery()) {
        const snapshot: Snapshot = { schema: EVENT_SCHEMA, version: CACHE_VERSION, upTo: seq, state: after };
        const snap = await git.ok(["hash-object", "-w", "--stdin"], { input: `${JSON.stringify(snapshot)}\n` });
        await git.ok(
          ["update-index", "--add", "--cacheinfo", `100644,${snap},snapshots/${String(seq).padStart(8, "0")}.json`],
          {
            env,
          },
        );
      }
      const tree = await git.ok(["write-tree"], { env });
      const commit = await git.ok(["commit-tree", tree, "-p", head, "-m", `${event.kind} ${planned.subject}`], { env });
      if ((await git.run(["update-ref", STATE_REF, commit, head])).exitCode === 0) {
        return { state: after, subject: planned.subject, written: true };
      }
    }
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
  throw new WriteFailure("apply", [
    {
      path: "$",
      rule: "store-busy",
      problem: "The state store kept changing underneath this command.",
      fix: "Run the command again.",
    },
  ]);
}

interface TicketDocument {
  effort: string;
  title: string;
  type: StoreTicket["type"];
  report?: string;
  criteria?: StoreCriterion[];
  spec?: string;
  blockedBy?: string[];
  triageRole?: string;
  hitl?: boolean;
}

interface MapDocument {
  effort: string;
  title: string;
  destination?: string;
  notes?: string;
  fog?: string[];
  outOfScope?: string[];
}

const diagnostic = (path: string, rule: string, problem: string, fix: string): Diagnostic => ({
  path,
  rule,
  problem,
  fix,
});

function checkEffort(effort: string): Diagnostic[] {
  try {
    assertMapName(effort);
    return [];
  } catch {
    return [
      diagnostic(
        "effort",
        "bad-effort",
        `"${effort}" is not an effort slug.`,
        "Use one word without slashes, spaces or a leading dot, e.g. shop.",
      ),
    ];
  }
}

function checkOneLine(path: string, value: string): Diagnostic[] {
  return value.trim() === "" || /[\r\n]/.test(value)
    ? [diagnostic(path, "one-line", "It must be one non-empty line.", `Write ${path} as a single line of text.`)]
    : [];
}

function checkTicket(doc: TicketDocument, state: StoreState): Diagnostic[] {
  const out = [...checkEffort(doc.effort), ...checkOneLine("title", doc.title)];
  if (doc.spec !== undefined && (/^([a-z]:|[\\/])/i.test(doc.spec) || doc.spec.split(/[\\/]/).includes(".."))) {
    out.push(
      diagnostic(
        "spec",
        "bad-path",
        "The spec must be a path inside the repo.",
        "Use a relative path like .scratch/shop/spec.md.",
      ),
    );
  }
  (doc.criteria ?? []).forEach((c, i) => out.push(...checkOneLine(`criteria[${i}].text`, c.text)));
  (doc.blockedBy ?? []).forEach((ref, i) => {
    const match = /^([^/\s]+)\/(\d+)$/.exec(ref);
    const path = `blockedBy[${i}]`;
    if (match === null) {
      out.push(
        diagnostic(
          path,
          "bad-reference",
          `"${ref}" is not a ticket reference.`,
          "Write it as effort/NN, e.g. shop/01.",
        ),
      );
    } else if (match[1] !== doc.effort) {
      out.push(
        diagnostic(path, "cross-effort", `${ref} is in another effort.`, `Block on tickets of ${doc.effort} only.`),
      );
    } else if (!state.tickets.some((t) => t.effort === doc.effort && Number(t.id) === Number(match[2]))) {
      out.push(
        diagnostic(
          path,
          "no-such-ticket",
          `Blocker ${ref} does not exist.`,
          "Create the blocker first, or name an existing ticket.",
        ),
      );
    }
  });
  return out;
}

/** Creates a ticket from a document: parse, check, then append one `ticket.created` event. */
export async function createStoreTicket(cwd: string, text: string, opts: WriteOptions) {
  const doc = parseDocument<TicketDocument>(TICKET_INPUT, text);
  const role = doc.triageRole === undefined || doc.triageRole === "" ? null : (doc.triageRole as TriageRole);
  const done = await writeToStore(
    cwd,
    (state) => {
      const number =
        state.tickets.filter((t) => t.effort === doc.effort).reduce((max, t) => Math.max(max, Number(t.id)), 0) + 1;
      const id = padId(number);
      return {
        diagnostics: checkTicket(doc, state),
        subject: `${doc.effort}/${id}`,
        event: {
          kind: "ticket.created",
          effort: doc.effort,
          id,
          title: doc.title.trim(),
          type: doc.type,
          report: doc.report?.trim() ?? "",
          criteria: (doc.criteria ?? []).map((c) => ({ text: c.text.trim(), done: c.done })),
          spec: doc.spec ?? null,
          blockedBy: (doc.blockedBy ?? []).map((ref) => padId(Number(ref.split("/")[1]))),
          triageRole: role,
          hitl: doc.hitl ?? false,
        },
      };
    },
    opts,
  );
  const [effort = "", id = ""] = done.subject.split("/");
  const ticket = done.state.tickets.find((t) => t.effort === effort && t.id === id) as StoreTicket;
  return { ticket, written: done.written };
}

/** Creates an effort's map from a document: parse, check, then append one `map.created` event. */
export async function createStoreMap(cwd: string, text: string, opts: WriteOptions) {
  const doc = parseDocument<MapDocument>(MAP_INPUT, text);
  const done = await writeToStore(
    cwd,
    (state) => {
      const diagnostics = [...checkEffort(doc.effort), ...checkOneLine("title", doc.title)];
      if (state.maps.some((m) => m.effort === doc.effort)) {
        diagnostics.push(
          diagnostic(
            "effort",
            "map-exists",
            `${doc.effort} already has a map.`,
            `Read it with \`dryland map show ${doc.effort}\`, or pick another effort slug.`,
          ),
        );
      }
      return {
        diagnostics,
        subject: doc.effort,
        event: {
          kind: "map.created",
          effort: doc.effort,
          title: doc.title.trim(),
          destination: doc.destination?.trim() ?? "",
          notes: doc.notes?.trim() ?? "",
          fog: doc.fog ?? [],
          outOfScope: doc.outOfScope ?? [],
        },
      };
    },
    opts,
  );
  const map = done.state.maps.find((m) => m.effort === done.subject) as StoreMap;
  return { map, written: done.written };
}
