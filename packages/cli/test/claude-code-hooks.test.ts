import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CLAUDE_CODE,
  envKey,
  hookSettings,
  liveLockFile,
  type LiveEvent,
  type LiveListener,
  startLiveListener,
} from "@dryland/core";
import { afterEach, describe, expect, it } from "vitest";
import { drylandOnPath } from "./harness.ts";

const FAKE_CLAUDE = fileURLToPath(new URL("./fake-claude-hooks.mjs", import.meta.url));

const listeners: LiveListener[] = [];
afterEach(async () => {
  await Promise.all(listeners.splice(0).map((listener) => listener.close()));
});

/**
 * Plays a Claude Code session: a running app, `dryland` on `PATH`, the session's environment as Dryland sets it,
 * and a fake CLI that fires native hook events from the settings it was launched with.
 */
async function session(settings: unknown) {
  const appDir = mkdtempSync(join(tmpdir(), "dryland-app-"));
  const received: LiveEvent[] = [];
  listeners.push(
    await startLiveListener({ lockFile: liveLockFile({ DRYLAND_APP_DIR: appDir }), onEvent: (e) => received.push(e) }),
  );
  const pathKey = envKey(process.env, "PATH");
  const env = {
    ...process.env,
    [pathKey]: [drylandOnPath(), process.env[pathKey]].join(delimiter),
    DRYLAND_APP_DIR: appDir,
    DRYLAND_SESSION_ID: "session-a",
  };
  const args = [FAKE_CLAUDE];
  if (settings !== null) {
    const file = join(mkdtempSync(join(tmpdir(), "dryland-settings-")), "claude-code.json");
    writeFileSync(file, JSON.stringify(settings));
    args.push("--settings", file);
  }
  /** Fires `event` in the fake CLI, in its session `cliSession` when given, and returns the events the app received. */
  const fireEvents = async (event: string, cliSession?: string) => {
    const before = received.length;
    const sessionArgs = cliSession === undefined ? [] : ["--session-id", cliSession];
    // Not spawnSync: the listener answers on this process's event loop.
    await new Promise((resolve) =>
      spawn(process.execPath, [...args, ...sessionArgs, event], { env, cwd: appDir }).on("close", resolve),
    );
    return received.slice(before);
  };
  /** The session and kind of each event `event` reported. */
  const fire = async (event: string) => (await fireEvents(event)).map((e) => ({ session: e.session_id, kind: e.kind }));
  return { fire, fireEvents };
}

describe("Claude Code status hooks", () => {
  it.each([
    ["UserPromptSubmit", "session.running"],
    ["PreToolUse", "session.running"],
    ["PostToolUse", "session.running"],
    ["PostToolUseFailure", "session.running"],
    ["PermissionRequest", "session.waiting"],
    ["Notification:permission_prompt", "session.waiting"],
    ["Notification:elicitation_dialog", "session.waiting"],
    ["Notification:elicitation_url_dialog", "session.waiting"],
    ["Elicitation", "session.waiting"],
    ["ElicitationResult", "session.running"],
    ["Stop", "session.idle"],
    ["Notification:idle_prompt", "session.idle"],
    ["SessionEnd:prompt_input_exit", "session.ended"],
    ["SessionEnd:logout", "session.ended"],
  ])("report %s as %s for the session", async (event, kind) => {
    const { fire } = await session(hookSettings(CLAUDE_CODE.statusEvents));

    expect(await fire(event)).toEqual([{ session: "session-a", kind }]);
  });

  it("carry the CLI's own session id, and the new one once the CLI has changed it, as after /clear", async () => {
    const { fireEvents } = await session(hookSettings(CLAUDE_CODE.statusEvents));

    const [before] = await fireEvents("Stop", "launched-id");
    const [after] = await fireEvents("UserPromptSubmit", "cleared-id");

    expect(before).toMatchObject({ session_id: "session-a", kind: "session.idle", agent_session_id: "launched-id" });
    expect(after).toMatchObject({ session_id: "session-a", kind: "session.running", agent_session_id: "cleared-id" });
  });

  it("keep the session live through /clear: the old id's SessionEnd reports nothing, the new id's events do", async () => {
    const { fire, fireEvents } = await session(hookSettings(CLAUDE_CODE.statusEvents));

    expect(await fire("SessionEnd:clear")).toEqual([]);
    const [after] = await fireEvents("UserPromptSubmit", "cleared-id");
    expect(after).toMatchObject({ session_id: "session-a", kind: "session.running", agent_session_id: "cleared-id" });
  });

  it("report nothing for a notification that is not about the session's state", async () => {
    const { fire } = await session(hookSettings(CLAUDE_CODE.statusEvents));

    expect(await fire("Notification:auth_success")).toEqual([]);
  });

  it("are absent from a Claude Code started without Dryland's settings, which reports nothing", async () => {
    const { fire } = await session(null);

    expect(await fire("UserPromptSubmit")).toEqual([]);
    expect(await fire("Stop")).toEqual([]);
  });
});
