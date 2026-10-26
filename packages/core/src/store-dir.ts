import { randomUUID } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { DrylandError } from "./errors.ts";
import { gitOk, runGit } from "./git-exec.ts";

/** The git config key, in the repo's own config, that binds a repo to its store. */
const REPO_ID_KEY = "dryland.repoId";

/** The file in a store dir that records the repo (its git common dir) the store belongs to. */
const REPO_PATH_FILE = "repo-path";

type Env = Record<string, string | undefined>;

/**
 * The user data dir the stores live under: `DRYLAND_DATA_DIR` when set, else `%LOCALAPPDATA%\Dryland`,
 * `~/Library/Application Support/Dryland` or `$XDG_DATA_HOME/dryland`. It is never inside a repo.
 */
export function dataDir(
  env: Env = process.env,
  platform: NodeJS.Platform = process.platform,
  home: string = homedir(),
): string {
  if (env["DRYLAND_DATA_DIR"]) return env["DRYLAND_DATA_DIR"];
  if (platform === "win32") return join(env["LOCALAPPDATA"] || join(home, "AppData", "Local"), "Dryland");
  if (platform === "darwin") return join(home, "Library", "Application Support", "Dryland");
  return join(env["XDG_DATA_HOME"] || join(home, ".local", "share"), "dryland");
}

/** The bare git dir of the store with `repoId`. */
export const storeDirOfId = (repoId: string, env: Env = process.env): string =>
  join(dataDir(env), "stores", `${repoId}.git`);

/** The repo id the repo containing `cwd` is bound to, or `null` before `dryland init`. */
export async function repoIdOf(cwd: string): Promise<string | null> {
  const result = await runGit(cwd, ["config", "--get", REPO_ID_KEY]);
  const id = result.stdout.trim();
  return result.exitCode === 0 && id !== "" ? id : null;
}

/** The git common dir of the repo containing `cwd`, resolved, so every worktree of a repo gives the same path. */
async function repoPathOf(cwd: string): Promise<string> {
  const common = await gitOk(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  return realpathSync.native(common);
}

/** Thrown when a repo carries the id of a store that belongs to another repo that still exists. */
export class CopiedRepoError extends DrylandError {
  constructor(repo: string, owner: string) {
    super(
      `This repo (${repo}) carries the store id of ${owner}, which still exists, so it looks like a copy that would share that store.`,
      "Run `dryland init --new-store` for an empty store of its own, or `dryland init --bind <repo id>` to share one on purpose.",
    );
    this.name = "CopiedRepoError";
  }
}

/**
 * Checks the store at `dir` belongs to the repo containing `cwd`. A repo that was moved (the recorded path is gone)
 * is re-recorded; one whose recorded repo still exists is a copy.
 */
async function assertNotCopied(cwd: string, dir: string): Promise<void> {
  const here = await repoPathOf(cwd);
  const file = join(dir, REPO_PATH_FILE);
  const recorded = (await readFile(file, "utf8").catch(() => "")).trim();
  if (recorded === here) return;
  if (recorded !== "" && existsSync(recorded)) throw new CopiedRepoError(here, recorded);
  // Unrecorded, or the repo was moved: this one owns the store now. A read-only data dir only costs the next check.
  await writeFile(file, `${here}\n`).catch(() => undefined);
}

/** The store dir of the repo containing `cwd`, or `null` when the repo is not bound to one or has none on disk. */
export async function storeDir(cwd: string): Promise<string | null> {
  const id = await repoIdOf(cwd);
  if (id === null) return null;
  const dir = storeDirOfId(id);
  if (!existsSync(join(dir, "HEAD"))) return null;
  await assertNotCopied(cwd, dir);
  return dir;
}

export interface BindOptions {
  /** Re-bind the repo to the existing store of this id. */
  bind?: string;
  /** Give the repo a new, empty store of its own, whatever id it carries. */
  newStore?: boolean;
}

/**
 * Binds the repo containing `cwd` to a store and makes sure its bare git dir exists. A repo gets a fresh random id;
 * `bind` re-binds a moved, copied or re-cloned repo to an existing store, and `newStore` gives a copy its own.
 * Without either, a repo that carries the id of another repo's store is refused.
 */
export async function bindStore(cwd: string, opts: BindOptions = {}): Promise<{ dir: string; created: boolean }> {
  const existing = await repoIdOf(cwd);
  let id = opts.newStore === true ? null : existing;
  if (opts.bind !== undefined) {
    if (!/^[0-9a-f-]{36}$/.test(opts.bind) || !existsSync(join(storeDirOfId(opts.bind), "HEAD"))) {
      throw new DrylandError(
        `There is no store with id "${opts.bind}" on this machine.`,
        `Stores live in ${join(dataDir(), "stores")}; pass the name of one, without .git.`,
      );
    }
    id = opts.bind;
  }
  id ??= randomUUID();
  const dir = storeDirOfId(id);
  const created = !existsSync(join(dir, "HEAD"));
  if (created) {
    await mkdir(dir, { recursive: true });
    await gitOk(dir, ["init", "--quiet", "--bare", "--initial-branch=state", dir]);
  }
  const explicit = opts.bind !== undefined || opts.newStore === true;
  if (!explicit && !created) await assertNotCopied(cwd, dir);
  if (explicit || created) await writeFile(join(dir, REPO_PATH_FILE), `${await repoPathOf(cwd)}\n`);
  if (existing !== id) await gitOk(cwd, ["config", REPO_ID_KEY, id]);
  return { dir, created };
}
