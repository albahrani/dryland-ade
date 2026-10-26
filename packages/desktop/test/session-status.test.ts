import { COPILOT_CLI, hookStateOf, type LiveEvent, type ReportedState } from "@dryland/core";
import { describe, expect, it } from "vitest";
import { createSessionStatus } from "../src/main/session-status.ts";

const event = (session: string, state: ReportedState): LiveEvent => ({
  session_id: session,
  state,
  timestamp: "2026-10-15T10:00:00.000Z",
});

describe("session status", () => {
  it("is launched at spawn and follows the session's events", () => {
    const status = createSessionStatus();
    status.launched("a");
    expect(status.states()).toEqual({ a: "launched" });

    const seen = (["running", "waiting", "running", "idle", "ended"] as const).map((state) => {
      status.apply(event("a", state));
      return status.states()["a"];
    });

    expect(seen).toEqual(["running", "waiting", "running", "idle", "ended"]);
  });

  it("ignores events of sessions Dryland did not start", () => {
    const status = createSessionStatus();
    status.launched("a");

    expect(status.apply(event("stranger", "running"))).toBe(false);
    expect(status.apply(event("", "running"))).toBe(false);
    expect(status.states()).toEqual({ a: "launched" });
  });

  it("ends a session whose process exits, and nothing brings an ended session back", () => {
    const status = createSessionStatus();
    status.launched("a");
    status.apply(event("a", "running"));

    status.exited("a");
    expect(status.apply(event("a", "idle"))).toBe(false);

    expect(status.states()).toEqual({ a: "ended" });
  });

  it("reports whether a change happened, so callers only redraw on one", () => {
    const status = createSessionStatus();
    status.launched("a");

    expect(status.apply(event("a", "running"))).toBe(true);
    expect(status.apply(event("a", "running"))).toBe(false);
  });
});

describe("session status of a Copilot CLI session", () => {
  /** Plays Copilot's native hook events through the adapter's mapping, as `dryland agent-hook` reports them. */
  function play(status: ReturnType<typeof createSessionStatus>, hook: string, payload: unknown = {}) {
    const state = hookStateOf(COPILOT_CLI, hook, payload);
    if (state !== null) status.apply(event("a", state));
    return status.states()["a"];
  }

  it("stays launched until the first prompt: sessionStart fires only then, and says nothing", () => {
    const status = createSessionStatus();
    status.launched("a");

    expect(play(status, "userPromptSubmitted")).toBe("running");
    expect(play(status, "sessionStart", { source: "new" })).toBe("running");
  });

  it("is launched, not changed, by a pre-typed command, which fires no hook", () => {
    const status = createSessionStatus();
    status.launched("a");

    expect(status.states()).toEqual({ a: "launched" });
    expect(play(status, "notification", { notification_type: "agent_idle" })).toBe("launched");
  });

  it("follows a turn that asks for permission", () => {
    const status = createSessionStatus();
    status.launched("a");

    const seen = [
      play(status, "userPromptSubmitted"),
      play(status, "preToolUse"),
      play(status, "permissionRequest"),
      play(status, "notification", { notification_type: "permission_prompt" }),
      play(status, "postToolUse"),
      play(status, "agentStop"),
      play(status, "sessionEnd"),
    ];

    expect(seen).toEqual(["running", "running", "waiting", "waiting", "running", "idle", "ended"]);
  });
});
