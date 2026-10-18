import { describe, expect, it } from "vitest";
import { pausedBadge, pausedSessions } from "../src/shared/paused-session.ts";

describe("the badge of a paused session", () => {
  it("is gold when it was waiting on the user and red when it was interrupted", () => {
    expect(pausedBadge("waiting")).toEqual({ label: "Paused: was waiting on you", tone: "gold" });
    expect(pausedBadge("interrupted")).toEqual({ label: "Paused: interrupted", tone: "red" });
  });

  it("is plain, and says only Paused, for a session that was idle or whose state was never seen", () => {
    expect(pausedBadge(null)).toEqual({ label: "Paused", tone: "plain" });
  });
});

describe("the paused sessions of a project", () => {
  const paused = {
    sessionId: "c1",
    agentId: "claude-code",
    agent: "Claude Code",
    resumeCommand: "claude --resume c1",
    was: "waiting" as const,
    lastSeen: "2026-10-18T09:00:00Z",
    branch: "shop/02-grill",
  };

  it("show on a ticket whose live sessions have all ended, and on none that has a live one", () => {
    const sessions = [{ id: "s1", ticket: { map: "shop", id: "02" } }];

    expect(pausedSessions({ "shop/02": paused }, sessions, { s1: "ended" }).get("shop/02")).toEqual(paused);
    expect(pausedSessions({ "shop/02": paused }, sessions, { s1: "idle" }).has("shop/02")).toBe(false);
    expect(pausedSessions({ "shop/03": paused }, sessions, { s1: "idle" }).has("shop/03")).toBe(true);
  });
});
