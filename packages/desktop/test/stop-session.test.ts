import { describe, expect, it } from "vitest";
import { isStopConfirmation, stopNeedsConfirmation } from "../src/shared/stop-session.ts";

describe("stop session confirmation", () => {
  it("by default asks when the session is working, or waiting or idle with unseen output", () => {
    const asks = (state: Parameters<typeof stopNeedsConfirmation>[1], unseen: boolean) =>
      stopNeedsConfirmation("busy-or-unseen", state, unseen);
    expect(asks("running", false)).toBe(true);
    expect(asks("waiting", true)).toBe(true);
    expect(asks("idle", true)).toBe(true);
    expect(asks("idle", false)).toBe(false);
    expect(asks("waiting", false)).toBe(false);
    expect(asks("launched", false)).toBe(false);
  });

  it("always or never asks when the setting says so, and never for a session that has ended", () => {
    expect(stopNeedsConfirmation("always", "idle", false)).toBe(true);
    expect(stopNeedsConfirmation("never", "running", true)).toBe(false);
    expect(stopNeedsConfirmation("always", "ended", true)).toBe(false);
  });

  it("knows its settings", () => {
    expect(isStopConfirmation("never")).toBe(true);
    expect(isStopConfirmation("sometimes")).toBe(false);
  });
});
