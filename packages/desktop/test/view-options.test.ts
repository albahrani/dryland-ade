import type { TicketsTree, TreeTicket } from "@dryland/core";
import { describe, expect, it } from "vitest";
import { applyViewOptions, DEFAULT_VIEW_OPTIONS } from "../src/shared/view-options.ts";

const row = (id: string, title: string, status: TreeTicket["status"]): TreeTicket => ({
  id,
  map: "shop",
  title,
  type: "task",
  status,
  claimant: null,
  blockers: [],
});

const tree: TicketsTree = {
  maps: [
    {
      name: "shop",
      title: "Shop",
      fog: ["Payments"],
      planning: [],
      implementation: [row("01", "Zebra", "ready"), row("02", "Apple", "blocked"), row("03", "Mango", "in-progress")],
      done: [row("00", "Old", "done")],
    },
  ],
};

const shop = (options: Partial<typeof DEFAULT_VIEW_OPTIONS>) =>
  applyViewOptions(tree, { ...DEFAULT_VIEW_OPTIONS, ...options }).maps[0]!;

describe("applyViewOptions", () => {
  it("keeps ticket-number order and everything visible by default", () => {
    const view = shop({});
    expect(view.implementation.map((t) => t.id)).toEqual(["01", "02", "03"]);
    expect(view.done).toHaveLength(1);
    expect(view.fog).toEqual(["Payments"]);
  });

  it("sorts by title or by status", () => {
    expect(shop({ sort: "title" }).implementation.map((t) => t.title)).toEqual(["Apple", "Mango", "Zebra"]);
    expect(shop({ sort: "status" }).implementation.map((t) => t.status)).toEqual(["ready", "in-progress", "blocked"]);
  });

  it("filters open tickets by status", () => {
    expect(shop({ statuses: ["blocked"] }).implementation.map((t) => t.id)).toEqual(["02"]);
  });

  it("hides done tickets and fog on request", () => {
    const view = shop({ showDone: false, showFog: false });
    expect(view.done).toEqual([]);
    expect(view.fog).toEqual([]);
  });

  it("does not modify the tree it is given", () => {
    shop({ sort: "title", showDone: false });
    expect(tree.maps[0]!.implementation.map((t) => t.id)).toEqual(["01", "02", "03"]);
  });
});
