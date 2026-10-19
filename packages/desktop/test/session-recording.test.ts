import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CLAUDE_CODE,
  envKey,
  hookSettings,
  type LiveEvent,
  liveLockFile,
  type LiveListener,
  nodeProcessRunner,
  readSessionIndex,
  recordSession,
  startLiveListener,
} from "@dryland/core";
import { afterEach, describe, expect, it } from "vitest";
import { writeLauncher } from "../src/main/launcher.ts";
import { createSessionRecorder, sessionItem } from "../src/main/session-recording.ts";
import type { SessionInfo } from "../src/shared/api.ts";
import { fixtureRepo } from "./fixture-repo.ts";

const CLI = fileURLToPath(new URL("../../cli/dist/dryland.mjs", import.meta.url));
const FAKE_CLAUDE = fileURLToPath(new URL("../../cli/test/fake-claude-hooks.mjs", import.meta.url));

const listeners: LiveListener[] = [];
afterEach(async () => {
  await Promise.all(listeners.splice(0).map((listener) => listener.close()));
});

/** A Claude Code session Dryland started on ticket shop/02 of `repo`, launched with CLI session id `launched-id`. */
function sessionIn(repo: string, overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    id: "dryland-session",
    terminalId: "t1",
    agent: { id: "claude-code", name: "Claude Code" },
    agentSessionId: "launched-id",
    project: repo,
    ticket: { map: "shop", id: "02" },
    map: "shop",
    worktree: { branch: "shop/02-grill", path: repo },
    command: null,
    startedAt: "2026-10-16T12:00:00.000Z",
    ...overrides,
  };
}

/** A recorder over `sessions`, its warnings, and the index of `repo` as the item `shop/02` holds it. */
function recorderFor(repo: string, sessions: SessionInfo[]) {
  const warnings: string[] = [];
  const recorder = createSessionRecorder({
    runner: nodeProcessRunner,
    sessions: () => sessions,
    warn: (w) => warnings.push(w),
  });
  const indexed = async (item = "shop/02") => {
    await recorder.flush();
    return (await readSessionIndex(nodeProcessRunner, repo)).index.items[item] ?? [];
  };
  return { recorder, warnings, indexed };
}

const event = (kind: LiveEvent["kind"], extra: Partial<LiveEvent> = {}): LiveEvent => ({
  session_id: "dryland-session",
  kind,
  timestamp: "2026-10-16T12:00:01.000Z",
  ...extra,
});

describe("sessionItem", () => {
  it("is the ticket, else the map, else the scratch worktree branch of a new map", () => {
    const worktree = { branch: "new-map/scratch-wayfinder-2", path: "/w" };
    expect(sessionItem({ ticket: { map: "shop", id: "02" }, map: "shop", worktree })).toBe("shop/02");
    expect(sessionItem({ ticket: null, map: "shop", worktree })).toBe("shop");
    expect(sessionItem({ ticket: null, map: null, worktree })).toBe("new-map/scratch-wayfinder-2");
  });
});

describe("the session recorder", () => {
  it("updates the entry's last state and last seen from a state event", async () => {
    const repo = fixtureRepo();
    const { recorder, indexed } = recorderFor(repo, [sessionIn(repo)]);
    await recordSession(
      nodeProcessRunner,
      repo,
      "shop/02",
      { adapter: "claude-code", sessionId: "launched-id" },
      {
        now: new Date("2026-10-16T12:00:00.000Z"),
      },
    );

    recorder.apply(event("session.waiting", { agent_session_id: "launched-id" }));

    const [entry] = await indexed();
    expect(entry).toMatchObject({ sessionId: "launched-id", lastState: "waiting" });
    expect(Date.parse(entry?.lastSeen ?? "")).toBeGreaterThan(Date.parse("2026-10-16T12:00:00.000Z"));
  });

  it("records a session started by hand under its ticket, and one linked to nothing nowhere", async () => {
    const repo = fixtureRepo();
    const hand = sessionIn(repo, { id: "hand", manual: true, agentSessionId: null });
    const lost = sessionIn(repo, { id: "lost", manual: true, ticket: null, map: null, agentSessionId: null });
    const { recorder, indexed } = recorderFor(repo, [hand, lost]);

    recorder.apply(event("session.idle", { session_id: "hand", agent_session_id: "typed-id" }));
    recorder.apply(event("session.idle", { session_id: "lost", agent_session_id: "lost-id" }));

    expect((await indexed()).map((s) => s.sessionId)).toEqual(["typed-id"]);
    expect((await indexed("shop/02-grill")).map((s) => s.sessionId)).toEqual([]);
  });

  it("records a new CLI session id as the item's newest session and keeps the old one", async () => {
    const repo = fixtureRepo();
    const { recorder, indexed } = recorderFor(repo, [sessionIn(repo)]);

    recorder.apply(event("session.idle", { agent_session_id: "launched-id" }));
    recorder.apply(event("session.running", { agent_session_id: "cleared-id" }));

    expect(await indexed()).toMatchObject([
      { sessionId: "cleared-id", lastState: "running" },
      { sessionId: "launched-id", lastState: "idle" },
    ]);
  });

  it("handles an event without a CLI session id as one of the session it last heard of", async () => {
    const repo = fixtureRepo();
    const { recorder, indexed } = recorderFor(repo, [sessionIn(repo)]);

    recorder.apply(event("session.running"));
    recorder.apply(event("session.idle", { agent_session_id: "cleared-id" }));
    recorder.apply(event("session.waiting"));

    expect(await indexed()).toMatchObject([
      { sessionId: "cleared-id", lastState: "waiting" },
      { sessionId: "launched-id", lastState: "running" },
    ]);
  });

  it("keeps the last state when the session ends, and only moves its last seen", async () => {
    const repo = fixtureRepo();
    const { recorder, indexed } = recorderFor(repo, [sessionIn(repo)]);

    recorder.apply(event("session.idle"));
    recorder.apply(event("session.ended"));

    expect(await indexed()).toMatchObject([{ sessionId: "launched-id", lastState: "idle" }]);
  });

  it("ignores events of sessions Dryland did not start, and events that are not about a state", async () => {
    const repo = fixtureRepo();
    const { recorder, indexed } = recorderFor(repo, [sessionIn(repo)]);

    recorder.apply(event("session.idle", { session_id: "someone-else" }));
    recorder.apply(event("ticket.changed", { payload: { command: "ticket claim", ticket: "shop/02" } }));

    expect(await indexed()).toEqual([]);
  });

  it("records nothing for a CLI that reported no session id and was launched without one", async () => {
    const repo = fixtureRepo();
    const { recorder, indexed } = recorderFor(repo, [sessionIn(repo, { agentSessionId: null })]);

    recorder.apply(event("session.idle"));

    expect(await indexed()).toEqual([]);
  });

  it("warns, and still flushes, when the index cannot be written", async () => {
    const outside = mkdtempSync(join(tmpdir(), "dryland-not-a-repo-"));
    const { recorder, warnings } = recorderFor(outside, [sessionIn(outside)]);

    recorder.apply(event("session.idle"));
    await recorder.flush();

    expect(warnings).toEqual([expect.stringContaining("not recorded in the session index")]);
  });
});

describe("hook events from a Claude Code session reaching the index", () => {
  it("record the launched id's state, then the id the CLI switched to", async () => {
    const repo = fixtureRepo();
    const session = sessionIn(repo);
    const { recorder, indexed } = recorderFor(repo, [session]);
    const appDir = mkdtempSync(join(tmpdir(), "dryland-app-"));
    listeners.push(
      await startLiveListener({ lockFile: liveLockFile({ DRYLAND_APP_DIR: appDir }), onEvent: recorder.apply }),
    );
    const launcher = mkdtempSync(join(tmpdir(), "dryland-launcher-"));
    writeLauncher(launcher, { runtime: process.execPath, cli: CLI });
    const settings = join(appDir, "claude-code.json");
    writeFileSync(settings, JSON.stringify(hookSettings(CLAUDE_CODE.statusEvents)));
    const pathKey = envKey(process.env, "PATH");
    const env = {
      ...process.env,
      [pathKey]: [launcher, process.env[pathKey]].join(delimiter),
      DRYLAND_APP_DIR: appDir,
      DRYLAND_SESSION_ID: session.id,
    };
    const fire = (hookEvent: string, cliSession: string) =>
      new Promise((resolve) =>
        spawn(process.execPath, [FAKE_CLAUDE, "--settings", settings, "--session-id", cliSession, hookEvent], {
          env,
          cwd: repo,
        }).on("close", resolve),
      );

    await fire("Stop", "launched-id");
    await fire("UserPromptSubmit", "cleared-id");

    expect(await indexed()).toMatchObject([
      { adapter: "claude-code", sessionId: "cleared-id", lastState: "running" },
      { adapter: "claude-code", sessionId: "launched-id", lastState: "idle" },
    ]);
  });
});
