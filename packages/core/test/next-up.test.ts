import { describe, expect, it } from "vitest";
import { type NextStep, nextUpMarkers, type StepTarget } from "../src/index.ts";

function step(ruleId: string, target: StepTarget): NextStep {
  return { ruleId, command: null, target, reason: `${ruleId} reason`, evidence: [] };
}

describe("nextUpMarkers", () => {
  it("marks the items of the top three steps, best first", () => {
    const steps = [
      step("implement-ticket", { kind: "ticket", map: "shop", id: "02" }),
      step("implement-ticket", { kind: "ticket", map: "shop", id: "03" }),
      step("implement-ticket", { kind: "ticket", map: "shop", id: "04" }),
      step("implement-ticket", { kind: "ticket", map: "shop", id: "05" }),
    ];
    expect(nextUpMarkers(steps)).toEqual([
      { item: { kind: "ticket", map: "shop", id: "02" }, step: steps[0] },
      { item: { kind: "ticket", map: "shop", id: "03" }, step: steps[1] },
      { item: { kind: "ticket", map: "shop", id: "04" }, step: steps[2] },
    ]);
  });

  it("puts a fog-only, cleared-map or spec step on the map", () => {
    const steps = [
      step("map-fog-only", { kind: "map", map: "shop" }),
      step("spec-without-tickets", { kind: "spec", map: "blog" }),
    ];
    expect(nextUpMarkers(steps).map((m) => m.item)).toEqual([
      { kind: "map", map: "shop" },
      { kind: "map", map: "blog" },
    ]);
  });

  it("marks an item once, with its best step, and fills the count with the next distinct items", () => {
    const steps = [
      step("review-before-pr", { kind: "ticket", map: "shop", id: "02" }),
      step("open-pr", { kind: "ticket", map: "shop", id: "02" }),
      step("implement-spec", { kind: "spec", map: "shop" }),
      step("map-cleared", { kind: "map", map: "shop" }),
      step("needs-triage", { kind: "ticket", map: "shop", id: "07" }),
    ];
    expect(nextUpMarkers(steps).map((m) => [m.item, m.step.ruleId])).toEqual([
      [{ kind: "ticket", map: "shop", id: "02" }, "review-before-pr"],
      [{ kind: "map", map: "shop" }, "implement-spec"],
      [{ kind: "ticket", map: "shop", id: "07" }, "needs-triage"],
    ]);
  });

  it("marks a waiting session's ticket, and skips steps with no ticket or map to mark", () => {
    const steps = [
      step("no-setup-config", { kind: "repo" }),
      step("waiting-session", { kind: "session", id: "s1", ticket: null }),
      step("waiting-session", { kind: "session", id: "s2", ticket: { map: "shop", id: "03" } }),
    ];
    expect(nextUpMarkers(steps)).toEqual([{ item: { kind: "ticket", map: "shop", id: "03" }, step: steps[2] }]);
  });

  it("marks nothing when there is no step", () => {
    expect(nextUpMarkers([])).toEqual([]);
  });
});
