import { randomUUID } from "node:crypto";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { delimiter, extname, join, resolve } from "node:path";
import { hookSettings, type AgentAdapter } from "./agent-adapter.ts";
import { envKey } from "./env-fs.ts";

/** A program and its arguments, as a PTY or a child process starts it. */
export interface Program {
  file: string;
  args: string[];
}

/** Windows runs a `.cmd` or `.bat` only through `cmd.exe`; anything else is spawned directly. */
export function programFor(
  executable: string,
  args: string[],
  env: Record<string, string | undefined>,
  platform: NodeJS.Platform = process.platform,
): Program {
  if (platform === "win32" && [".cmd", ".bat"].includes(extname(executable).toLowerCase())) {
    return { file: env[envKey(env, "ComSpec")] || "cmd.exe", args: ["/d", "/c", executable, ...args] };
  }
  return { file: executable, args };
}

/**
 * The adapter's launch arguments, the arguments that name or resume the CLI's session, and its settings flag naming
 * a file in `hooksDir` that holds the status hooks, written fresh on every launch. A file rather than inline JSON,
 * which `cmd.exe` would mangle.
 */
export function launchArgs(adapter: AgentAdapter, hooksDir: string, sessionArgs: readonly string[]): string[] {
  const args = [...adapter.launchArgs, ...sessionArgs];
  if (adapter.hookInjection.kind !== "settings-flag") return args;
  mkdirSync(hooksDir, { recursive: true });
  const file = join(hooksDir, `${adapter.id}.json`);
  // Renamed into place, so a CLI starting in parallel never reads half a file.
  const temporary = `${file}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(hookSettings(adapter.statusEvents), null, 2));
  renameSync(temporary, file);
  return [...args, adapter.hookInjection.flag, file];
}

/** `env` with directory `dir` taken off its `PATH`, so a lookup there finds the real program behind a shim in it. */
export function withoutPathDir(
  env: Record<string, string | undefined>,
  dir: string,
): Record<string, string | undefined> {
  const key = envKey(env, "PATH");
  const skipped = resolve(dir).toLowerCase();
  const kept = (env[key] ?? "")
    .split(delimiter)
    .filter((entry) => entry !== "" && resolve(entry).toLowerCase() !== skipped);
  return { ...env, [key]: kept.join(delimiter) };
}
