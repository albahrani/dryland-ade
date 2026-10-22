import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AGENT_ADAPTERS,
  COPILOT_CLI,
  copilotPaths,
  envKey,
  installCopilotHooks,
  liveLockFile,
  type LiveEvent,
  type LiveListener,
  startLiveListener,
} from "@dryland/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { drylandOnPath, runDryland } from "./harness.ts";

const FAKE_COPILOT = fileURLToPath(new URL("./fake-copilot-hooks.mjs", import.meta.url));

const listeners: LiveListener[] = [];
afterEach(async () => {
  await Promise.all(listeners.splice(0).map((listener) => listener.close()));
});

/**
 * Plays a Copilot CLI session: a running app, `dryland` on `PATH`, Dryland's installed hook file, the session's
 * environment as Dryland sets it (unless `inDryland` is false), and a fake CLI that fires native hook events.
 */
async function session({ inDryland = true } = {}) {
  const appDir = mkdtempSync(join(tmpdir(), "dryland-app-"));
  const received: LiveEvent[] = [];
  listeners.push(
    await startLiveListener({ lockFile: liveLockFile({ DRYLAND_APP_DIR: appDir }), onEvent: (e) => received.push(e) }),
  );
  const paths = copilotPaths({}, mkdtempSync(join(tmpdir(), "dryland-copilot-home-")));
  await installCopilotHooks(paths, COPILOT_CLI);
  const pathKey = envKey(process.env, "PATH");
  // The tests may run inside an Agent CLI session, whose id the hooks would otherwise report.
  const inherited = { ...process.env };
  for (const adapter of AGENT_ADAPTERS) if (adapter.sessionEnv !== null) delete inherited[adapter.sessionEnv];
  const env = {
    ...inherited,
    [pathKey]: [drylandOnPath(), process.env[pathKey]].join(delimiter),
    DRYLAND_APP_DIR: appDir,
    ...(inDryland ? { DRYLAND_SESSION_ID: "session-a", DRYLAND_PANE_KEY: "pane-1" } : {}),
  };
  /** Fires `event` in the fake CLI and returns the events the app received. */
  const fireEvents = async (event: string, cliSession = "copilot-id") => {
    const before = received.length;
    const args = [FAKE_COPILOT, "--hooks", paths.hookFile, "--session-id", cliSession, event];
    // Not spawnSync: the listener answers on this process's event loop.
    await new Promise((resolve) => spawn(process.execPath, args, { env, cwd: appDir }).on("close", resolve));
    return received.slice(before);
  };
  /** Runs the hook command with exactly `input` on stdin, without a shell that could change the bytes. */
  const hookWithInput = async (event: string, input: string) => {
    const before = received.length;
    const stdinEnv = { DRYLAND_APP_DIR: appDir, DRYLAND_SESSION_ID: "session-a", DRYLAND_PANE_KEY: "pane-1" };
    await runDryland(["agent-hook", COPILOT_CLI.id, event], { cwd: appDir, env: stdinEnv, input });
    await vi.waitFor(() => expect(received.length).toBeGreaterThan(before));
    return received.slice(before).map((e) => e.kind);
  };
  return { fireEvents, hookWithInput, fire: async (event: string) => (await fireEvents(event)).map((e) => e.kind) };
}

describe("Copilot CLI status hooks", () => {
  it.each([
    ["userPromptSubmitted", "session.running"],
    ["preToolUse", "session.running"],
    ["postToolUse", "session.running"],
    ["permissionRequest", "session.waiting"],
    ["notification:permission_prompt", "session.waiting"],
    ["agentStop", "session.idle"],
    ["sessionEnd", "session.ended"],
  ])("report %s as %s for the session", async (event, kind) => {
    const { fire } = await session();

    expect(await fire(event)).toEqual([kind]);
  });

  it("read a payload that starts with a byte order mark, as PowerShell can pipe it", async () => {
    const { hookWithInput } = await session();
    const payload = JSON.stringify({ sessionId: "copilot-id", notification_type: "permission_prompt" });

    expect(await hookWithInput("notification", String.fromCharCode(0xfeff) + payload)).toEqual(["session.waiting"]);
  });

  it("report nothing for sessionStart, which fires only at the first prompt: launched comes from the spawn", async () => {
    const { fire } = await session();

    expect(await fire("sessionStart")).toEqual([]);
  });

  it("report nothing for a notification that is not about waiting, such as agent_idle", async () => {
    const { fire } = await session();

    expect(await fire("notification:agent_idle")).toEqual([]);
    expect(await fire("notification:shell_completed")).toEqual([]);
  });

  it("carry the session of Dryland's terminal and the CLI's own session id from the payload", async () => {
    const { fireEvents } = await session();

    const [event] = await fireEvents("agentStop", "learned-at-first-submit");

    expect(event).toMatchObject({
      session_id: "session-a",
      kind: "session.idle",
      agent_session_id: "learned-at-first-submit",
    });
  });

  it("do nothing in a Copilot started outside a Dryland terminal", async () => {
    const { fire } = await session({ inDryland: false });

    expect(await fire("userPromptSubmitted")).toEqual([]);
    expect(await fire("agentStop")).toEqual([]);
  });
});
