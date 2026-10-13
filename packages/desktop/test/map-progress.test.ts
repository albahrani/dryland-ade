import type { TicketsTreeMap, TreeTicket } from "@dryland/core";
import { describe, expect, it } from "vitest";
import { mapProgress, PROGRESS_ORDER } from "../src/shared/map-progress.ts";
import { STATUS_META } from "../src/shared/status-meta.ts";

const row = (id: string, status: TreeTicket["status"]): TreeTicket => ({
  id,
  map: "shop",
  title: id,
  type: "task",
  status,
  claimant: null,
  blockers: [],
});

const map = (over: Partial<TicketsTreeMap>): TicketsTreeMap => ({
  name: "shop",
  title: "Shop",
  fog: [],
  planning: [],
  implementation: [],
  done: [],
  ...over,
});

describe("mapProgress", () => {
  it("counts tickets of every kind by status, done tickets and fog items", () => {
    const progress = mapProgress(
      map({
        fog: ["Payments", "Shipping"],
        planning: [row("01", "ready"), row("02", "blocked")],
        implementation: [row("03", "in-progress"), row("04", "blocked"), row("05", "ready")],
        done: [row("00", "done")],
      }),
    );

    expect(progress.counts).toEqual({ done: 1, "in-progress": 1, ready: 2, blocked: 2, fog: 2 });
    expect(progress.total).toBe(8);
  });

  it("gives an empty map a total of zero", () => {
    expect(mapProgress(map({})).total).toBe(0);
  });

  it("orders the bar from done through fog", () => {
    expect(PROGRESS_ORDER).toEqual(["done", "in-progress", "ready", "blocked", "fog"]);
  });
});

describe("STATUS_META", () => {
  it("describes every ticket status once", () => {
    expect(Object.keys(STATUS_META).sort()).toEqual(["blocked", "done", "in-progress", "ready"]);
    expect(STATUS_META.ready).toMatchObject({ label: "Ready", shape: "○" });
  });
});
