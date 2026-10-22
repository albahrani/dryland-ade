// The hook side of a fake Claude Code: fires native hook events the way the real CLI does, by running each
// matching command hook from the settings passed with `--settings`, with the event's JSON on stdin and the session id
// in CLAUDE_CODE_SESSION_ID (as Claude Code 2.1.301 does), the one given with `--session-id` or a fixed one.
// Used as a module by stub agents (`fire`), or run directly:
// node fake-claude-hooks.mjs [--settings <file>] [--session-id <id>] <Event[:subtype]>...
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DEFAULT_SESSION_ID = "fake-claude-session";

/** The value after `flag` in `argv`, or `undefined` when it is not there. */
const valueOf = (argv, flag) => {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
};

/** The settings file given with `--settings`, or `null` when the CLI was started without one. */
export function settingsFrom(argv) {
  const file = valueOf(argv, "--settings");
  return file === undefined ? null : JSON.parse(readFileSync(file, "utf8"));
}

/** The session id given with `--session-id`; the CLI picks its own otherwise. */
export function sessionIdFrom(argv) {
  return valueOf(argv, "--session-id") ?? DEFAULT_SESSION_ID;
}

/** Claude Code's matcher rule: empty, missing or `*` matches everything; otherwise a regex over the subtype. */
function matches(matcher, subtype) {
  if (matcher === undefined || matcher === "" || matcher === "*") return true;
  return new RegExp(`^(?:${matcher})$`).test(subtype ?? "");
}

/** Runs every command hook registered for `event` (`Event` or `Event:subtype`) in session `sessionId`; returns how many ran. */
export function fire(settings, event, sessionId = DEFAULT_SESSION_ID) {
  if (settings === null) return 0;
  const [name, subtype] = event.split(":");
  const input = JSON.stringify({
    hook_event_name: name,
    session_id: sessionId,
    cwd: process.cwd(),
    ...(name === "Notification" ? { notification_type: subtype } : {}),
    ...(name === "SessionEnd" ? { reason: subtype } : {}),
  });
  const env = { ...process.env, CLAUDE_CODE_SESSION_ID: sessionId };
  let ran = 0;
  for (const group of settings.hooks?.[name] ?? []) {
    if (!matches(group.matcher, name === "Notification" || name === "SessionEnd" ? subtype : undefined)) continue;
    for (const hook of group.hooks ?? []) {
      if (hook.type !== "command") continue;
      spawnSync(hook.command, { shell: true, input, env, stdio: ["pipe", "ignore", "inherit"] });
      ran++;
    }
  }
  return ran;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const settings = settingsFrom(argv);
  const sessionId = sessionIdFrom(argv);
  const flags = new Set(["--settings", "--session-id"]);
  const events = argv.filter((arg, i) => !flags.has(arg) && !flags.has(argv[i - 1]));
  for (const event of events) fire(settings, event, sessionId);
}
