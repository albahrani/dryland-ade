import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { AgentAdapter } from "./agent-adapter.ts";

/**
 * The user-level files GitHub Copilot CLI reads (ADR 0006's user-config exception): a hook file Dryland owns in its
 * hooks directory, and `trustedFolders` in `config.json`, which keeps the trust prompt off Dryland's worktrees.
 */
export interface CopilotPaths {
  dir: string;
  config: string;
  /** The lock file Copilot holds while it rewrites the trusted folders of `config`. */
  lock: string;
  hookFile: string;
}

type Env = Record<string, string | undefined>;

/** Copilot's config directory: `COPILOT_HOME` when set, else `.copilot` in the user's home. */
export function copilotPaths(env: Env = process.env, home: string = homedir()): CopilotPaths {
  const dir = env["COPILOT_HOME"] || join(home, ".copilot");
  const config = join(dir, "config.json");
  return { dir, config, lock: `${config}.trusted-folders.lock`, hookFile: join(dir, "hooks", "dryland.json") };
}

/** One hook entry of a Copilot hook file: the same gated command for each shell Copilot may run it with. */
interface CopilotHook {
  type: "command";
  bash: string;
  powershell: string;
  timeoutSec: number;
}

/**
 * The hook file for an adapter's native events: each calls `dryland agent-hook`, which reads the event's payload
 * from stdin and reports the session state its `statusEvents` give. Gated on `DRYLAND_PANE_KEY`, which only
 * Dryland's PTYs set, so the file does nothing in a Copilot started anywhere else.
 */
export function copilotHookFile(adapter: Pick<AgentAdapter, "id" | "statusEvents">): {
  version: 1;
  hooks: Record<string, CopilotHook[]>;
} {
  const hooks: Record<string, CopilotHook[]> = {};
  for (const key of Object.keys(adapter.statusEvents)) {
    const event = key.split(":")[0] ?? key;
    const command = `dryland agent-hook ${adapter.id} ${event}`;
    hooks[event] ??= [
      {
        type: "command",
        bash: `[ -z "$DRYLAND_PANE_KEY" ] || ${command}`,
        powershell: `if ($env:DRYLAND_PANE_KEY) { $input | ${command} }`,
        // Seconds, as Copilot counts; `dryland` gives up on an app that does not answer well within this.
        timeoutSec: 5,
      },
    ];
  }
  return { version: 1, hooks };
}

const hookFileText = (adapter: Pick<AgentAdapter, "id" | "statusEvents">) =>
  `${JSON.stringify(copilotHookFile(adapter), null, 2)}\n`;

export type HookFileStatus = "missing" | "installed" | "outdated";

/** Whether Dryland's hook file is in Copilot's hooks directory, and current. */
export async function copilotHooksStatus(paths: CopilotPaths, adapter: AgentAdapter): Promise<HookFileStatus> {
  const text = await readFile(paths.hookFile, "utf8").catch(() => null);
  if (text === null) return "missing";
  return text === hookFileText(adapter) ? "installed" : "outdated";
}

/** Writes Dryland's hook file, replacing an outdated one. Returns whether the file changed. */
export async function installCopilotHooks(paths: CopilotPaths, adapter: AgentAdapter): Promise<boolean> {
  if ((await copilotHooksStatus(paths, adapter)) === "installed") return false;
  await mkdir(dirname(paths.hookFile), { recursive: true });
  const temporary = `${paths.hookFile}.${randomUUID()}.tmp`;
  await writeFile(temporary, hookFileText(adapter));
  await renameInto(temporary, paths.hookFile);
  return true;
}

/** Deletes Dryland's hook file; no other file of the hooks directory is touched. Returns whether it was there. */
export async function removeCopilotHooks(paths: CopilotPaths): Promise<boolean> {
  const was = (await stat(paths.hookFile).catch(() => null)) !== null;
  await rm(paths.hookFile, { force: true });
  return was;
}

// --- config.json: text edits, so that nothing but the one entry ever changes ---

interface Span {
  start: number;
  end: number;
}

const WHITESPACE = /\s/;

function skipWhitespace(text: string, from: number): number {
  let i = from;
  while (i < text.length && WHITESPACE.test(text[i] ?? "")) i++;
  return i;
}

/** The end of the JSON value that starts at `from`. */
function valueEnd(text: string, from: number): number {
  const first = text[from];
  if (first === '"') {
    let i = from + 1;
    while (i < text.length && text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
    return i + 1;
  }
  if (first === "{" || first === "[") {
    let depth = 0;
    let i = from;
    while (i < text.length) {
      const c = text[i];
      if (c === '"') {
        i = valueEnd(text, i);
        continue;
      }
      if (c === "{" || c === "[") depth++;
      if (c === "}" || c === "]") depth--;
      i++;
      if (depth === 0) return i;
    }
    return i;
  }
  let i = from;
  while (i < text.length && !/[\s,\]}]/.test(text[i] ?? "")) i++;
  return i;
}

/** The members of the object or array whose opening bracket is at `open`, keyed by name for an object. */
function members(text: string, open: number): { key: string | null; value: Span }[] {
  const found: { key: string | null; value: Span }[] = [];
  const isObject = text[open] === "{";
  let i = skipWhitespace(text, open + 1);
  while (i < text.length && text[i] !== "}" && text[i] !== "]") {
    let key: string | null = null;
    if (isObject) {
      const keyEnd = valueEnd(text, i);
      key = JSON.parse(text.slice(i, keyEnd)) as string;
      i = skipWhitespace(text, skipWhitespace(text, keyEnd) + 1);
    }
    const end = valueEnd(text, i);
    found.push({ key, value: { start: i, end } });
    i = skipWhitespace(text, end);
    if (text[i] === ",") i = skipWhitespace(text, i + 1);
  }
  return found;
}

const TRUSTED = "trustedFolders";

/** The leading whitespace of the line holding `index`. */
function lineIndent(text: string, index: number): string {
  const lineStart = text.lastIndexOf("\n", index - 1) + 1;
  return /^[ \t]*/.exec(text.slice(lineStart))?.[0] ?? "";
}

/** `text` with `folder` appended to `trustedFolders`; `null` when it is already listed or the key is not a list. */
function withTrusted(text: string, folder: string): string | null {
  const root = skipWhitespace(text, 0);
  const entry = members(text, root).find((m) => m.key === TRUSTED);
  const json = JSON.stringify(folder);
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const multiline = text.includes("\n");
  if (entry === undefined) {
    const close = text.lastIndexOf("}");
    const existing = members(text, root);
    const first = existing[0];
    const lead = first === undefined ? "  " : lineIndent(text, first.value.start);
    const unit = lead === "" ? "  " : lead;
    const list = multiline ? `[${eol}${lead}${unit}${json}${eol}${lead}]` : `[${json}]`;
    const before = text.slice(0, close).replace(/\s+$/, "");
    const comma = existing.length === 0 ? "" : ",";
    const member = multiline ? `${eol}${lead}"${TRUSTED}": ${list}` : `"${TRUSTED}": ${list}`;
    return `${before}${comma}${member}${multiline ? eol : ""}${text.slice(close)}`;
  }
  if (text[entry.value.start] !== "[") return null;
  const items = members(text, entry.value.start);
  if (items.some((item) => JSON.parse(text.slice(item.value.start, item.value.end)) === folder)) return null;
  const last = items.at(-1);
  if (last === undefined) {
    const lead = lineIndent(text, entry.value.start);
    const list = multiline ? `[${eol}${lead}${lead}${json}${eol}${lead}]` : `[${json}]`;
    return text.slice(0, entry.value.start) + list + text.slice(entry.value.end);
  }
  // Reuse the separator between the entries already there, so the new one is laid out like them.
  const previous = items.at(-2);
  const separator =
    previous === undefined
      ? `,${text.slice(entry.value.start + 1, last.value.start)}`
      : text.slice(previous.value.end, last.value.start);
  return text.slice(0, last.value.end) + separator + json + text.slice(last.value.end);
}

/** `text` without `folders` in `trustedFolders`; `null` when none was listed. */
function withoutTrusted(text: string, folders: ReadonlySet<string>): string | null {
  let result = text;
  let changed = false;
  for (;;) {
    const entry = members(result, skipWhitespace(result, 0)).find((m) => m.key === TRUSTED);
    if (entry === undefined || result[entry.value.start] !== "[") return changed ? result : null;
    const items = members(result, entry.value.start);
    const at = items.findIndex((item) => folders.has(JSON.parse(result.slice(item.value.start, item.value.end))));
    if (at === -1) return changed ? result : null;
    const item = items[at] as { value: Span };
    if (items.length === 1) {
      result = result.slice(0, entry.value.start) + "[]" + result.slice(entry.value.end);
    } else if (at > 0) {
      const previous = items[at - 1] as { value: Span };
      result = result.slice(0, previous.value.end) + result.slice(item.value.end);
    } else {
      const next = items[1] as { value: Span };
      result = result.slice(0, item.value.start) + result.slice(next.value.start);
    }
    changed = true;
  }
}

/** The folders Copilot trusts, or `null` when `config` is missing, unreadable or not a list. */
export async function readTrustedFolders(paths: CopilotPaths): Promise<string[] | null> {
  try {
    const parsed = JSON.parse(await readFile(paths.config, "utf8")) as Record<string, unknown>;
    const list = parsed[TRUSTED];
    return Array.isArray(list) ? list.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return null;
  }
}

export interface ConfigEditOptions {
  /** How long to wait for Copilot's lock before leaving the file alone. */
  lockWaitMs?: number;
  /** Called after the file was read and before it is written; lets a test play Copilot rewriting the file. */
  afterRead?: () => Promise<void> | void;
}

export interface ConfigEditResult {
  status: "changed" | "unchanged" | "skipped";
  /** Why the file was left alone, when it was. */
  warning?: string;
}

/** Windows refuses to replace a file another process has open for a moment; retry briefly. */
async function renameInto(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= 20 || (code !== "EPERM" && code !== "EACCES" && code !== "EBUSY")) {
        await rm(from, { force: true });
        throw error;
      }
      await sleep(25);
    }
  }
}

/** Takes the lock file, waiting while someone holds it; `false` when it stayed held. */
async function takeLock(lock: string, waitMs: number): Promise<boolean> {
  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      await (await open(lock, "wx")).close();
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (Date.now() >= deadline) return false;
      await sleep(50);
    }
  }
}

/**
 * Edits `config.json` as text, under Copilot's lock. Never rewrites a file that is missing or not valid JSON, and
 * never an entry but the one it changes. A file Copilot rewrote between the read and the write is read again, so
 * neither side's changes are lost.
 */
async function editConfig(
  paths: CopilotPaths,
  edit: (text: string) => string | null,
  options: ConfigEditOptions,
): Promise<ConfigEditResult> {
  const original = await readFile(paths.config, "utf8").catch(() => null);
  if (original === null) return { status: "skipped" };
  const unparseable = (): ConfigEditResult => ({
    status: "skipped",
    warning: `${paths.config} is not valid JSON, so Dryland left it alone.`,
  });
  try {
    JSON.parse(original);
  } catch {
    return unparseable();
  }
  // Nothing to change: Copilot's lock is not taken, nor anything else of the user's written, for no reason.
  if (edit(original) === null) return { status: "unchanged" };
  if (!(await takeLock(paths.lock, options.lockWaitMs ?? 2000))) {
    return { status: "skipped", warning: `Copilot holds ${paths.lock}, so Dryland left ${paths.config} alone.` };
  }
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const text = await readFile(paths.config, "utf8");
      try {
        JSON.parse(text);
      } catch {
        return unparseable();
      }
      await options.afterRead?.();
      const next = edit(text);
      if (next === null) return { status: "unchanged" };
      if ((await readFile(paths.config, "utf8")) !== text) continue;
      const mode = (await stat(paths.config)).mode & 0o777;
      const temporary = `${paths.config}.${randomUUID()}.tmp`;
      await writeFile(temporary, next, { mode });
      await renameInto(temporary, paths.config);
      return { status: "changed" };
    }
    return { status: "skipped", warning: `${paths.config} kept changing, so Dryland left it alone.` };
  } finally {
    await rm(paths.lock, { force: true });
  }
}

/** Appends `folders` to Copilot's `trustedFolders`, so it asks no trust question there. Never creates `config.json`. */
export async function trustFolders(
  paths: CopilotPaths,
  folders: readonly string[],
  options: ConfigEditOptions = {},
): Promise<ConfigEditResult> {
  const real = await Promise.all(folders.map((folder) => realpath(folder).catch(() => folder)));
  return editConfig(
    paths,
    (text) => {
      let result = text;
      for (const folder of real) result = withTrusted(result, folder) ?? result;
      return result === text ? null : result;
    },
    options,
  );
}

/** The spellings under which Copilot may have been given `folder`, which may be gone by now. */
async function trustedSpellings(folder: string): Promise<string[]> {
  const parent = await realpath(dirname(folder)).catch(() => null);
  return [folder, ...(parent === null ? [] : [join(parent, basename(folder))])];
}

/** Takes `folders` off `trustedFolders`, leaving every other entry and key as it was. */
export async function untrustFolders(
  paths: CopilotPaths,
  folders: readonly string[],
  options: ConfigEditOptions = {},
): Promise<ConfigEditResult> {
  const spellings = new Set((await Promise.all(folders.map(trustedSpellings))).flat());
  return editConfig(paths, (text) => withoutTrusted(text, spellings), options);
}
