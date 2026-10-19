// The hook side of a fake GitHub Copilot CLI: fires native hook events the way the real CLI does, by running the
// command of each hook registered for the event in the hook file passed with `--hooks`, in the shell the platform
// uses (`powershell` on Windows, `bash` elsewhere), with the event's JSON on stdin and the session id in COPILOT_AGENT_SESSION_ID.
// Used as a module by stub agents (`fire`), or run directly:
// node fake-copilot-hooks.mjs --hooks <file> [--session-id <id>] <event[:notification_type]>...
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DEFAULT_SESSION_ID = "fake-copilot-session";

/** The value after `flag` in `argv`, or `undefined` when it is not there. */
const valueOf = (argv, flag) => {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
};

/** Runs every hook registered for `event` (`event` or `event:notification_type`); returns how many ran. */
export function fire(hookFile, event, sessionId = DEFAULT_SESSION_ID) {
  const [name, type] = event.split(":");
  const input = JSON.stringify({
    sessionId,
    timestamp: Date.now(),
    cwd: process.cwd(),
    ...(name === "notification" ? { notification_type: type } : {}),
  });
  const windows = process.platform === "win32";
  let ran = 0;
  for (const hook of JSON.parse(readFileSync(hookFile, "utf8")).hooks?.[name] ?? []) {
    if (hook.type !== "command") continue;
    const [file, args] = windows
      ? ["powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", hook.powershell]]
      : ["bash", ["-c", hook.bash]];
    spawnSync(file, args, {
      input,
      env: { ...process.env, COPILOT_AGENT_SESSION_ID: sessionId },
      stdio: ["pipe", "ignore", "inherit"],
    });
    ran++;
  }
  return ran;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const hookFile = valueOf(argv, "--hooks");
  const sessionId = valueOf(argv, "--session-id");
  const flags = new Set(["--hooks", "--session-id"]);
  for (const event of argv.filter((arg, i) => !flags.has(arg) && !flags.has(argv[i - 1]))) {
    fire(hookFile, event, sessionId);
  }
}
