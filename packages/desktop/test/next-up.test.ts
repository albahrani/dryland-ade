import type { NextUpMarker, TreeTicket } from "@dryland/core";
import { describe, expect, it } from "vitest";
import { whyNotText } from "../src/shared/next-up.ts";

function row(overrides: Partial<TreeTicket> = {}): TreeTicket {
  return {
    id: "03",
    map: "shop",
    title: "Build the cart",
    type: "task",
    status: "ready",
    claimant: null,
    blockers: [],
    ...overrides,
  };
}

const implement = (id: string): NextUpMarker => ({
  item: { kind: "ticket", map: "shop", id },
  step: {
    ruleId: "implement-ticket",
    command: `/implement shop/${id}`,
    target: { kind: "ticket", map: "shop", id },
    reason: `Ticket shop/${id} is ready-for-agent, unblocked and unclaimed.`,
    evidence: [],
  },
});

describe("whyNotText", () => {
  it("lists the unresolved blockers of a blocked ticket", () => {
    expect(whyNotText(row({ status: "blocked", blockers: ["01", "02"] }), [])).toBe(
      "Blocked by 01, 02: not resolved yet.",
    );
  });

  it("says blocking unknown when the tracker cannot report the blockers", () => {
    expect(whyNotText(row({ status: "blocked", blockers: "unknown" }), [])).toBe(
      "Blocking unknown: the tracker cannot say what blocks this ticket.",
    );
  });

  it("names the claimant of a claimed ticket", () => {
    expect(whyNotText(row({ status: "in-progress", claimant: "alex" }), [])).toBe("It is claimed by alex.");
  });

  it("says a claimed ticket with a paused session is paused, not stale", () => {
    expect(whyNotText(row({ status: "in-progress", claimant: "shop/03-cart" }), [], "Paused")).toBe(
      "Paused. Not stale: it is claimed by shop/03-cart and its session can be resumed.",
    );
    expect(whyNotText(row({ status: "in-progress", claimant: null }), [], "Paused: was waiting on you")).toBe(
      "Paused: was waiting on you. Not stale: it is claimed and its session can be resumed.",
    );
  });

  it("says a done ticket needs nothing", () => {
    expect(whyNotText(row({ status: "done" }), [])).toBe("It is done.");
  });

  it("gives the rank and reason of an unblocked ticket a step points at below the marked ones", () => {
    const ranked = [implement("01"), implement("02"), implement("03")];
    expect(whyNotText(row(), ranked)).toBe(
      "Nothing blocks it. It is next-up item 3, ranked below the marked items: Ticket shop/03 is ready-for-agent, unblocked and unclaimed.",
    );
  });

  it("says no rule recommends an unblocked ticket no step points at", () => {
    expect(whyNotText(row(), [implement("01")])).toBe("Nothing blocks it, but no rule recommends it.");
  });
});
