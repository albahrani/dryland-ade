import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { DrylandError } from "./errors.ts";
import { gitOk, runGit } from "./git-exec.ts";

/** The git config key, in the repo's own config, that binds a repo to its store. */
const REPO_ID_KEY = "dryland.repoId";

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

/** The store dir of the repo containing `cwd`, or `null` when the repo is not bound to one or has none on disk. */
export async function storeDir(cwd: string): Promise<string | null> {
  const id = await repoIdOf(cwd);
  if (id === null) return null;
  const dir = storeDirOfId(id);
  return existsSync(join(dir, "HEAD")) ? dir : null;
}

/**
 * Binds the repo containing `cwd` to a store and makes sure its bare git dir exists. A repo gets a fresh random id;
 * `bind` re-binds a moved, copied or re-cloned repo to an existing store instead.
 */
export async function bindStore(cwd: string, bind?: string): Promise<{ dir: string; created: boolean }> {
  const existing = await repoIdOf(cwd);
  let id = existing;
  if (bind !== undefined) {
    if (!/^[0-9a-f-]{36}$/.test(bind) || !existsSync(join(storeDirOfId(bind), "HEAD"))) {
      throw new DrylandError(
        `There is no store with id "${bind}" on this machine.`,
        `Stores live in ${join(dataDir(), "stores")}; pass the name of one, without .git.`,
      );
    }
    id = bind;
  }
  id ??= randomUUID();
  const dir = storeDirOfId(id);
  const created = !existsSync(join(dir, "HEAD"));
  if (created) {
    await mkdir(dir, { recursive: true });
    await gitOk(dir, ["init", "--quiet", "--bare", "--initial-branch=state", dir]);
  }
  if (existing !== id) await gitOk(cwd, ["config", REPO_ID_KEY, id]);
  return { dir, created };
}
