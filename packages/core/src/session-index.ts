import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AgentAdapter } from "./agent-adapter.ts";
import { DrylandError } from "./errors.ts";
import type { ProcessRunner } from "./process-runner.ts";
import { acquireLock, removeLeftoverTemps, writeAtomically } from "./tracker-write.ts";

/** How long a session stays in the index after it was last seen, unless the caller says otherwise. */
export const DEFAULT_SESSION_RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60_000;
const LAST_STATES = ["running", "waiting", "idle"] as const;

/** One Agent CLI session known for an item (ADR 0010). */
export interface IndexedSession {
  /** The id of the Agent adapter whose CLI runs the session, such as `claude-code`. */
  adapter: string;
  /** The CLI's own session id, the one it resumes by. */
  sessionId: string;
  /** ISO timestamp of the last time the session was recorded. */
  lastSeen: string;
  /** The state the app last saw; only the app writes it. */
  lastState?: (typeof LAST_STATES)[number];
}

/** A session as it is recorded: its last state only when the app saw one, which then replaces the old. */
export type RecordedSession = Pick<IndexedSession, "adapter" | "sessionId" | "lastState">;

/**
 * The session index: per item (a ticket `<map>/<NN>`, a map, or a scratch worktree branch), its known sessions,
 * newest first. A cache of what the Agent CLIs reported, never a source of truth.
 */
export interface SessionIndex {
  items: Record<string, IndexedSession[]>;
}

export interface SessionIndexRead {
  index: SessionIndex;
  /** Set when the file was there but could not be read as an index. */
  warnings: string[];
}

/** `<git common dir>/dryland/sessions.json`, the same file from the main checkout and every worktree. */
export async function sessionIndexPath(runner: ProcessRunner, cwd: string): Promise<string> {
  const common = await runner.run("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd });
  if (common.exitCode !== 0) {
    throw new DrylandError(
      `${cwd} is not inside a git repository.`,
      "Run dryland from inside the repo, or from one of its worktrees.",
    );
  }
  return join(common.stdout.trim(), "dryland", "sessions.json");
}

function isSession(value: unknown): value is IndexedSession {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s["adapter"] === "string" &&
    typeof s["sessionId"] === "string" &&
    typeof s["lastSeen"] === "string" &&
    !Number.isNaN(Date.parse(s["lastSeen"])) &&
    (s["lastState"] === undefined || (LAST_STATES as readonly unknown[]).includes(s["lastState"]))
  );
}

/** The index in `text`, or `null` when it is not one. Malformed sessions inside a valid index are dropped. */
export function parseSessionIndex(text: string): SessionIndex | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const items = (parsed as { items?: unknown } | null)?.items;
  if (typeof items !== "object" || items === null || Array.isArray(items)) return null;
  const index: SessionIndex = { items: {} };
  for (const [item, sessions] of Object.entries(items)) {
    const kept = Array.isArray(sessions) ? sessions.filter(isSession) : [];
    if (kept.length > 0) index.items[item] = kept;
  }
  return index;
}

async function readIndexFile(path: string): Promise<SessionIndexRead> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { index: { items: {} }, warnings: [] };
    return { index: { items: {} }, warnings: [`The session index ${path} could not be read; it reads as empty.`] };
  }
  const index = parseSessionIndex(text);
  if (index !== null) return { index, warnings: [] };
  return {
    index: { items: {} },
    warnings: [`The session index ${path} is not valid; it reads as empty and the next write replaces it.`],
  };
}

/** The session index; a missing one reads as empty, an unreadable one as empty with a warning. Never throws on the file. */
export async function readSessionIndex(runner: ProcessRunner, cwd: string): Promise<SessionIndexRead> {
  return readIndexFile(await sessionIndexPath(runner, cwd));
}

/** The known sessions of `item`, newest first. */
export function sessionsOf(index: SessionIndex, item: string): IndexedSession[] {
  return index.items[item] ?? [];
}

/**
 * `index` with `session` recorded for `item`: moved to the front with its last seen set to `now`, never duplicated,
 * with the last state given, else keeping the one it had. Sessions last seen before the retention period, and items
 * left empty, are dropped.
 */
export function withSession(
  index: SessionIndex,
  item: string,
  session: RecordedSession,
  now: Date,
  retentionDays: number = DEFAULT_SESSION_RETENTION_DAYS,
): SessionIndex {
  const same = (s: IndexedSession) => s.adapter === session.adapter && s.sessionId === session.sessionId;
  const known = sessionsOf(index, item).find(same);
  const { lastState = known?.lastState } = session;
  const recorded: IndexedSession = {
    adapter: session.adapter,
    sessionId: session.sessionId,
    lastSeen: now.toISOString(),
    ...(lastState === undefined ? {} : { lastState }),
  };
  const items: Record<string, IndexedSession[]> = {
    ...index.items,
    [item]: [recorded, ...sessionsOf(index, item).filter((s) => !same(s))],
  };
  const cutoff = now.getTime() - retentionDays * DAY_MS;
  const result: SessionIndex = { items: {} };
  for (const [key, sessions] of Object.entries(items)) {
    const kept = sessions.filter((s) => Date.parse(s.lastSeen) >= cutoff);
    if (kept.length > 0) result.items[key] = kept;
  }
  return result;
}

export interface RecordSessionOptions {
  retentionDays?: number;
  now?: Date;
}

/**
 * Records `session` against `item` in the session index, under the index's own lock beside the tracker lock and
 * atomically, so parallel `dryland` processes lose no entry. Returns warnings about an index it had to replace.
 */
export async function recordSession(
  runner: ProcessRunner,
  cwd: string,
  item: string,
  session: RecordedSession,
  options: RecordSessionOptions = {},
): Promise<string[]> {
  const path = await sessionIndexPath(runner, cwd);
  const release = await acquireLock(join(dirname(path), "sessions.lock"));
  try {
    const { index, warnings } = await readIndexFile(path);
    const updated = withSession(index, item, session, options.now ?? new Date(), options.retentionDays);
    await removeLeftoverTemps(dirname(path));
    await writeAtomically(path, `${JSON.stringify(updated, null, 2)}\n`);
    return warnings;
  } finally {
    await release();
  }
}

/** The Agent CLI session the current process runs in, from the first adapter whose session variable is set. */
export function currentAgentSession(
  adapters: readonly AgentAdapter[],
  env: NodeJS.ProcessEnv,
): { adapter: string; sessionId: string } | null {
  for (const adapter of adapters) {
    const sessionId = adapter.sessionEnv === null ? undefined : env[adapter.sessionEnv]?.trim();
    if (sessionId) return { adapter: adapter.id, sessionId };
  }
  return null;
}
