import { access, stat } from "node:fs/promises";
import { delimiter, join } from "node:path";

/** Whether `path` exists and is reachable. */
export async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

/** The spelling `env` uses for `name` (Windows spells it `Path`), or `name` itself when it is unset. */
export function envKey(env: Record<string, string | undefined>, name: string): string {
  return Object.keys(env).find((key) => key.toLowerCase() === name.toLowerCase()) ?? name;
}

async function isRunnable(path: string, windows: boolean): Promise<boolean> {
  const info = await stat(path).catch(() => null);
  if (info === null || !info.isFile()) return false;
  return windows || (info.mode & 0o111) !== 0;
}

/** The full path of the command `name` as a shell would find it on `env`'s `PATH`, or `null`. */
export async function findExecutable(
  name: string,
  env: Record<string, string | undefined> = process.env,
): Promise<string | null> {
  const dirs = (env[envKey(env, "PATH")] ?? "").split(delimiter).filter((dir) => dir !== "");
  // On Windows a command needs one of the PATHEXT extensions to run; elsewhere it needs the x bit.
  const windows = process.platform === "win32";
  const extensions = windows
    ? (env[envKey(env, "PATHEXT")] ?? ".COM;.EXE;.BAT;.CMD").split(";").filter((ext) => ext !== "")
    : [""];
  for (const dir of dirs) {
    for (const extension of extensions) {
      const candidate = join(dir, `${name}${extension.toLowerCase()}`);
      if (await isRunnable(candidate, windows)) return candidate;
    }
  }
  return null;
}
