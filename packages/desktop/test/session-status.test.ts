import type { LiveEvent, LiveEventKind } from "@dryland/core";
import { describe, expect, it } from "vitest";
import { createSessionStatus } from "../src/main/session-status.ts";

const event = (session: string, kind: LiveEventKind): LiveEvent => ({
  session_id: session,
  kind,
  timestamp: "2026-10-15T10:00:00.000Z",
});

describe("session status", () => {
  it("is launched at spawn and follows the session's events", () => {
    const status = createSessionStatus();
    status.launched("a");
    expect(status.states()).toEqual({ a: "launched" });

    const seen = (
      ["session.running", "session.waiting", "session.running", "session.idle", "session.ended"] as const
    ).map((kind) => {
      status.apply(event("a", kind));
      return status.states()["a"];
    });

    expect(seen).toEqual(["running", "waiting", "running", "idle", "ended"]);
  });

  it("ignores events of sessions Dryland did not start, and events that are not about a session's state", () => {
    const status = createSessionStatus();
    status.launched("a");

    expect(status.apply(event("stranger", "session.running"))).toBe(false);
    expect(status.apply(event("", "session.running"))).toBe(false);
    expect(status.apply(event("a", "ticket.changed"))).toBe(false);
    expect(status.apply(event("a", "session.started"))).toBe(false);
    expect(status.states()).toEqual({ a: "launched" });
  });

  it("ends a session whose process exits, and nothing brings an ended session back", () => {
    const status = createSessionStatus();
    status.launched("a");
    status.apply(event("a", "session.running"));

    status.exited("a");
    expect(status.apply(event("a", "session.idle"))).toBe(false);

    expect(status.states()).toEqual({ a: "ended" });
  });

  it("reports whether a change happened, so callers only redraw on one", () => {
    const status = createSessionStatus();
    status.launched("a");

    expect(status.apply(event("a", "session.running"))).toBe(true);
    expect(status.apply(event("a", "session.running"))).toBe(false);
  });
});
