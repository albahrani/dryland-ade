// The hook side of a fake Claude Code: fires native hook events the way the real CLI does, by running each
// matching command hook from the settings passed with `--settings`, with the event's JSON on stdin.
// Used as a module by stub agents (`fire`), or run directly: node fake-claude-hooks.mjs [--settings <file>] <Event[:subtype]>...
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** The settings file given with `--settings`, or `null` when the CLI was started without one. */
export function settingsFrom(argv) {
  const index = argv.indexOf("--settings");
  return index === -1 ? null : JSON.parse(readFileSync(argv[index + 1], "utf8"));
}

/** Claude Code's matcher rule: empty, missing or `*` matches everything; otherwise a regex over the subtype. */
function matches(matcher, subtype) {
  if (matcher === undefined || matcher === "" || matcher === "*") return true;
  return new RegExp(`^(?:${matcher})$`).test(subtype ?? "");
}

/** Runs every command hook registered for `event` (`Event` or `Event:subtype`); returns how many ran. */
export function fire(settings, event) {
  if (settings === null) return 0;
  const [name, subtype] = event.split(":");
  const input = JSON.stringify({
    hook_event_name: name,
    session_id: "fake-claude-session",
    cwd: process.cwd(),
    ...(name === "Notification" ? { notification_type: subtype } : {}),
  });
  let ran = 0;
  for (const group of settings.hooks?.[name] ?? []) {
    if (!matches(group.matcher, name === "Notification" ? subtype : undefined)) continue;
    for (const hook of group.hooks ?? []) {
      if (hook.type !== "command") continue;
      spawnSync(hook.command, { shell: true, input, stdio: ["pipe", "ignore", "inherit"] });
      ran++;
    }
  }
  return ran;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const settings = settingsFrom(argv);
  const events = argv.filter((arg, i) => arg !== "--settings" && argv[i - 1] !== "--settings");
  for (const event of events) fire(settings, event);
}
