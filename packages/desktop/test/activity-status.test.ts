import type { SessionState } from "@dryland/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActivityStatus } from "../src/main/activity-status.ts";
import { createSessionStatus } from "../src/main/session-status.ts";

describe("status guessed from a hookless CLI's output", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup() {
    const reports: [string, SessionState][] = [];
    const activity = createActivityStatus({ quietMs: 1000, report: (id, state) => reports.push([id, state]) });
    return { reports, activity };
  }

  it("is working while output keeps coming and idle once it has paused", () => {
    const { reports, activity } = setup();

    activity.output("a");
    vi.advanceTimersByTime(600);
    activity.output("a");
    vi.advanceTimersByTime(600);
    expect(reports).toEqual([["a", "running"]]);

    vi.advanceTimersByTime(500);
    expect(reports).toEqual([
      ["a", "running"],
      ["a", "idle"],
    ]);
  });

  it("goes back to working on new output after it was idle", () => {
    const { reports, activity } = setup();
    activity.output("a");
    vi.advanceTimersByTime(1000);
    activity.output("a");
    expect(reports.map(([, state]) => state)).toEqual(["running", "idle", "running"]);
  });

  it("stops guessing for a session whose process ended", () => {
    const { reports, activity } = setup();
    activity.output("a");
    activity.forget("a");
    vi.advanceTimersByTime(5000);
    expect(reports).toEqual([["a", "running"]]);
  });
});

describe("a guessed state in the session status", () => {
  it("moves a launched session, and never revives an ended one", () => {
    const status = createSessionStatus();
    status.launched("a");

    expect(status.observe("a", "running")).toBe(true);
    expect(status.observe("a", "running")).toBe(false);
    status.exited("a");
    expect(status.observe("a", "idle")).toBe(false);
    expect(status.states()).toEqual({ a: "ended" });
  });
});
