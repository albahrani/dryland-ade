import { describe, expect, it } from "vitest";
import {
  commandLine,
  commandWithInput,
  CONFIRMATION_TYPES,
  isTicketAction,
  trackerArgs,
  trackerInput,
} from "../src/shared/tracker-actions.ts";

const ticket = { map: "shop", id: "02" };

describe("trackerArgs", () => {
  it("turns each ticket action into its dryland command, with no commit flag", () => {
    expect(trackerArgs({ kind: "claim", ticket })).toEqual(["ticket", "claim", "shop/02"]);
    expect(trackerArgs({ kind: "release", ticket })).toEqual(["ticket", "release", "shop/02"]);
    expect(trackerArgs({ kind: "resolve", ticket, answer: "Built it." })).toEqual([
      "ticket",
      "resolve",
      "shop/02",
      "--answer",
      "Built it.",
    ]);
    expect(trackerArgs({ kind: "unblock", ticket: { map: "shop", id: "03" }, blocker: "02" })).toEqual([
      "ticket",
      "block",
      "shop/03",
      "--remove",
      "02",
    ]);
  });

  it("accepts a triage role exactly when the dialog chose a valid one", () => {
    const created = { map: "shop", title: "Pay", type: "task" as const, question: "", blockedBy: [] };
    const triaged = { ...created, status: "needs-triage" as const };
    expect(isTicketAction({ kind: "create", ticket: triaged })).toBe(true);
    expect(isTicketAction({ kind: "create", ticket: { ...created, status: "--json" } })).toBe(false);
  });
});

describe("creating tickets and maps", () => {
  const created = {
    map: "shop",
    title: "Pay by card",
    type: "grilling" as const,
    question: "Which cards?",
    blockedBy: ["02", "03"],
    status: "needs-triage" as const,
  };

  it("pipes one ticket document to `ticket create`", () => {
    const action = { kind: "create" as const, ticket: created };
    expect(trackerArgs(action)).toEqual(["ticket", "create"]);
    expect(JSON.parse(trackerInput(action) ?? "null")).toEqual({
      effort: "shop",
      title: "Pay by card",
      type: "grilling",
      report: "Which cards?",
      blockedBy: ["shop/02", "shop/03"],
      triageRole: "needs-triage",
    });
  });

  it("leaves out an empty question, no blockers and no role, and sends nothing for an action without a document", () => {
    const action = { kind: "create" as const, ticket: { ...created, question: "", blockedBy: [], status: undefined } };
    expect(JSON.parse(trackerInput(action) ?? "null")).toEqual({
      effort: "shop",
      title: "Pay by card",
      type: "grilling",
    });
    expect(trackerInput({ kind: "claim", ticket })).toBeNull();
  });

  it("creates a map from a document of effort, title and destination", () => {
    const action = {
      kind: "create-map" as const,
      map: { map: "shop", title: "Shop", destination: "Sell things." },
    };
    expect(trackerArgs(action)).toEqual(["map", "create"]);
    expect(JSON.parse(trackerInput(action) ?? "null")).toEqual({
      effort: "shop",
      title: "Shop",
      destination: "Sell things.",
    });
    expect(commandWithInput(["map", "create"], '{"effort":"shop"}')).toBe('dryland map create < {"effort":"shop"}');
  });

  it("accepts a well-formed new map only", () => {
    const map = { map: "shop", title: "Shop", destination: "" };
    expect(isTicketAction({ kind: "create-map", map })).toBe(true);
    expect(isTicketAction({ kind: "create-map", map: { ...map, map: "--json" } })).toBe(false);
    expect(isTicketAction({ kind: "create-map", map: { ...map, title: " " } })).toBe(false);
    expect(isTicketAction({ kind: "create-map", map: { ...map, destination: 3 } })).toBe(false);
  });
});

describe("commandLine", () => {
  it("shows the command as it would be typed, quoting arguments with spaces or quotes", () => {
    expect(commandLine(["ticket", "release", "shop/02"])).toBe("dryland ticket release shop/02");
    expect(commandLine(["ticket", "resolve", "shop/02", "--answer", 'Said "done" twice'])).toBe(
      'dryland ticket resolve shop/02 --answer "Said \\"done\\" twice"',
    );
    expect(commandLine(["ticket", "resolve", "shop/02", "--answer", ""])).toBe(
      'dryland ticket resolve shop/02 --answer ""',
    );
  });
});

describe("isTicketAction", () => {
  it("accepts the four ticket actions and refuses anything else from the renderer", () => {
    expect(isTicketAction({ kind: "claim", ticket })).toBe(true);
    expect(isTicketAction({ kind: "resolve", ticket, answer: "x" })).toBe(true);
    expect(isTicketAction({ kind: "unblock", ticket, blocker: "01" })).toBe(true);
    expect(isTicketAction({ kind: "resolve", ticket })).toBe(false);
    expect(isTicketAction({ kind: "release", ticket: { map: "shop" } })).toBe(false);
    expect(isTicketAction({ kind: "delete", ticket })).toBe(false);
    expect(isTicketAction({ kind: "claim", ticket: { map: "--json", id: "02" } })).toBe(false);
    expect(isTicketAction(null)).toBe(false);
  });

  it("accepts a well-formed new ticket only", () => {
    const created = { map: "shop", title: "Pay", type: "task", question: "", blockedBy: ["02"] };
    expect(isTicketAction({ kind: "create", ticket: created })).toBe(true);
    expect(isTicketAction({ kind: "create", ticket: { ...created, title: "  " } })).toBe(false);
    expect(isTicketAction({ kind: "create", ticket: { ...created, type: "epic" } })).toBe(false);
    expect(isTicketAction({ kind: "create", ticket: { ...created, map: "--json" } })).toBe(false);
    expect(isTicketAction({ kind: "create", ticket: { ...created, blockedBy: ["--remove"] } })).toBe(false);
  });
});

describe("CONFIRMATION_TYPES", () => {
  it("names the kinds of confirmed write", () => {
    expect(CONFIRMATION_TYPES).toEqual(["tracker-metadata", "user-config"]);
  });
});
