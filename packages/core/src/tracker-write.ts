import { randomUUID } from "node:crypto";
import { link, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { DrylandError } from "./errors.ts";
import { findMainCheckout } from "./main-checkout.ts";
import type { ProcessRunner } from "./process-runner.ts";

/** How long a writer waits for the lock before giving up. */
const LOCK_TIMEOUT_MS = 30_000;
/** A lock file nobody can read is treated as left by a crash once it is this old. */
const UNREADABLE_LOCK_MS = 2_000;
/** A lock this old is broken even when its pid is alive: the pid may have been reused after a crash. */
const LOCK_MAX_AGE_MS = 10 * 60_000;

export interface TrackerChange {
  /** Path relative to the main checkout, with forward slashes. */
  path: string;
  content: string;
}

export interface TrackerWrite<T> {
  changes: TrackerChange[];
  /** The commit message; one commit covers all `changes`. */
  message: string;
  value: T;
  /** Things the user should know about this write, reported with the result. */
  warnings?: string[];
}

export interface TrackerWriteOptions {
  /** `false` leaves the change on disk without a commit. `undefined` reads git's `dryland.autoCommit`, on by default. */
  autoCommit?: boolean;
}

export interface TrackerWriteResult<T> {
  value: T;
  /** Things the user should know that did not stop the write. */
  warnings: string[];
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

interface LockInfo {
  pid: number;
  token: string;
  at: number;
}

async function readLock(lockPath: string): Promise<LockInfo | null> {
  try {
    const info = JSON.parse(await readFile(lockPath, "utf8")) as Partial<LockInfo>;
    if (typeof info.pid === "number" && typeof info.token === "string" && typeof info.at === "number") {
      return { pid: info.pid, token: info.token, at: info.at };
    }
  } catch {
    // Missing or unreadable: treated as no readable holder.
  }
  return null;
}

/** Removes the lock if its holder is gone. Returns whether the lock may be free now. */
async function breakStaleLock(lockPath: string): Promise<boolean> {
  const seen = await readLock(lockPath);
  if (seen === null) {
    // Gone already (free to take), or present but unreadable: only a crash or corruption leaves that.
    const info = await stat(lockPath).catch(() => null);
    if (info === null) return true;
    if (Date.now() - info.mtimeMs < UNREADABLE_LOCK_MS) return false;
    await rm(lockPath, { force: true });
    return true;
  }
  if (pidAlive(seen.pid) && Date.now() - seen.at < LOCK_MAX_AGE_MS) return false;
  // Rename is atomic, so exactly one breaker takes the file; the others see it vanish.
  const taken = `${lockPath}.stale-${randomUUID()}`;
  try {
    await rename(lockPath, taken);
  } catch {
    return true;
  }
  if ((await readLock(taken))?.token !== seen.token) {
    // The stale lock was replaced between our read and our rename, so we took a live one: put it back.
    await link(taken, lockPath).catch(() => undefined);
  }
  await rm(taken, { force: true });
  return true;
}

/** Takes the tracker lock, waiting for a live holder. Returns the function that releases it. */
async function acquireLock(lockPath: string): Promise<() => Promise<void>> {
  await mkdir(dirname(lockPath), { recursive: true });
  const token = randomUUID();
  const pending = `${lockPath}.${token}`;
  await writeFile(pending, JSON.stringify({ pid: process.pid, token, at: Date.now() } satisfies LockInfo));
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  try {
    for (;;) {
      try {
        await link(pending, lockPath); // atomic, and fails if the lock exists
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      if (Date.now() > deadline) throw lockTimeout(lockPath);
      if (!(await breakStaleLock(lockPath))) await sleep(10 + Math.random() * 30);
    }
  } finally {
    await rm(pending, { force: true });
  }
  return async () => {
    if ((await readLock(lockPath))?.token === token) await rm(lockPath, { force: true });
  };
}

function lockTimeout(lockPath: string): DrylandError {
  return new DrylandError(
    `Another dryland command has held the tracker lock for over ${LOCK_TIMEOUT_MS / 1000} seconds.`,
    `Retry in a moment. If no dryland command is running, delete ${lockPath}.`,
  );
}
const TEMP_FILE = /^.[0-9a-f-]{36}.tmp$/;

/** Under the lock no write is in flight, so any temp file here was left by a process that crashed mid-write. */
async function removeLeftoverTemps(dir: string): Promise<void> {
  for (const name of await readdir(dir).catch(() => [])) {
    if (TEMP_FILE.test(name)) await rm(join(dir, name), { force: true });
  }
}

/** Writes a file so readers see the old or the new content, never a partial one. */
async function writeAtomically(path: string, content: string): Promise<void> {
  const temp = join(dirname(path), `.${randomUUID()}.tmp`);
  await writeFile(temp, content);
  try {
    // Windows refuses to replace a file another process has open for a moment; retry briefly.
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(temp, path);
        return;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (attempt >= 20 || (code !== "EPERM" && code !== "EACCES" && code !== "EBUSY")) throw error;
        await sleep(25);
      }
    }
  } finally {
    await rm(temp, { force: true });
  }
}

/** The repo's default branch: origin's HEAD, else `init.defaultBranch`, `main` or `master`; `null` when none exists. */
export async function defaultBranch(runner: ProcessRunner, mainCheckout: string): Promise<string | null> {
  const git = async (...args: string[]) => {
    const result = await runner.run("git", args, { cwd: mainCheckout });
    return result.exitCode === 0 ? result.stdout.trim() : "";
  };
  const remoteHead = await git("symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD");
  if (remoteHead.startsWith("origin/")) return remoteHead.slice("origin/".length);
  const configured = await git("config", "--get", "init.defaultBranch");
  for (const name of [...(configured === "" ? [] : [configured]), "main", "master"]) {
    if ((await git("rev-parse", "--verify", "--quiet", `refs/heads/${name}`)) !== "") return name;
  }
  return null;
}

/**
 * The write path of the local-markdown tracker. Locates the main checkout from `cwd`, takes the lock,
 * lets `produce` read the current state and say what to change, writes those files atomically and
 * commits only their paths. Nothing else in the main checkout is staged or committed.
 */
export async function writeTracker<T>(
  runner: ProcessRunner,
  cwd: string,
  options: TrackerWriteOptions,
  produce: (mainCheckout: string) => Promise<TrackerWrite<T>>,
): Promise<TrackerWriteResult<T>> {
  const mainCheckout = await findMainCheckout(runner, cwd);
  const git = (args: string[]) => runner.run("git", args, { cwd: mainCheckout });
  const warnings: string[] = [];

  const common = await git(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const lockPath = join(common.stdout.trim(), "dryland", "tracker.lock");

  const release = await acquireLock(lockPath);
  try {
    const { changes, message, value, warnings: produced = [] } = await produce(mainCheckout);
    warnings.push(...produced);
    for (const change of changes) {
      const target = join(mainCheckout, change.path);
      await removeLeftoverTemps(dirname(target));
      await writeAtomically(target, change.content);
    }

    const current = (await git(["symbolic-ref", "--quiet", "--short", "HEAD"])).stdout.trim();
    const expected = await defaultBranch(runner, mainCheckout);
    if (expected !== null && current !== expected) {
      warnings.push(
        `The main checkout is on ${current === "" ? "a detached HEAD" : `branch ${current}`}, not the default branch ${expected}. ` +
          `Tracker changes are being recorded there; switch the main checkout back to ${expected} when you can.`,
      );
    }

    const autoCommit =
      options.autoCommit ?? (await git(["config", "--type=bool", "--get", "dryland.autoCommit"])).stdout.trim() !== "false";
    if (autoCommit) {
      const paths = changes.map((change) => change.path);
      // `add` makes a new ticket file known to git; `commit -- <paths>` then takes only those paths,
      // leaving anything else staged or dirty in the main checkout alone.
      const added = await git(["add", "--", ...paths]);
      const committed =
        added.exitCode === 0 ? await git(["commit", "--quiet", "-m", message, "--", ...paths]) : added;
      if (committed.exitCode !== 0) {
        const reason = (committed.stderr || committed.stdout).trim().split("\n").slice(-3).join(" ");
        warnings.push(
          `The change is saved on disk but was not committed (${reason}). ` +
            `Fix the cause and run: git -C "${mainCheckout}" commit -m ${JSON.stringify(message)} -- ${paths.join(" ")}`,
        );
      }
    }
    return { value, warnings };
  } finally {
    await release();
  }
}
