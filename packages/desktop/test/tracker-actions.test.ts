import { describe, expect, it } from "vitest";
import {
  autoCommitFor,
  commandLine,
  commandWithInput,
  CONFIRMATION_TYPES,
  isTicketAction,
  trackerArgs,
  trackerInput,
} from "../src/shared/tracker-actions.ts";

const ticket = { map: "shop", id: "02" };

describe("trackerArgs", () => {
  it("turns each ticket action into its dryland command", () => {
    expect(trackerArgs({ kind: "claim", ticket }, true)).toEqual(["ticket", "claim", "shop/02", "--commit"]);
    expect(trackerArgs({ kind: "release", ticket }, true)).toEqual(["ticket", "release", "shop/02", "--commit"]);
    expect(trackerArgs({ kind: "resolve", ticket, answer: "Built it." }, true)).toEqual([
      "ticket",
      "resolve",
      "shop/02",
      "--answer",
      "Built it.",
      "--commit",
    ]);
    expect(trackerArgs({ kind: "unblock", ticket: { map: "shop", id: "03" }, blocker: "02" }, true)).toEqual([
      "ticket",
      "block",
      "shop/03",
      "--remove",
      "02",
      "--commit",
    ]);
  });

  it("creates a ticket with the dialog's fields, leaving out an empty question and no blockers", () => {
    const created = { map: "shop", title: "Pay by card", type: "task" as const, question: "", blockedBy: [] };
    expect(trackerArgs({ kind: "create", ticket: created }, true)).toEqual([
      "ticket",
      "create",
      "--map",
      "shop",
      "--title",
      "Pay by card",
      "--type",
      "task",
      "--commit",
    ]);
    const full = { ...created, type: "grilling" as const, question: "Which cards?", blockedBy: ["02", "03"] };
    expect(commandLine(trackerArgs({ kind: "create", ticket: full }, false))).toBe(
      'dryland ticket create --map shop --title "Pay by card" --type grilling --question "Which cards?" --blocked-by 02,03 --no-commit',
    );
  });

  it("passes --status exactly when the dialog chose a role", () => {
    const created = { map: "shop", title: "Pay", type: "task" as const, question: "", blockedBy: [] };
    expect(trackerArgs({ kind: "create", ticket: created }, true)).not.toContain("--status");
    const triaged = { ...created, status: "needs-triage" as const };
    expect(commandLine(trackerArgs({ kind: "create", ticket: triaged }, true))).toBe(
      "dryland ticket create --map shop --title Pay --type task --status needs-triage --commit",
    );
    expect(isTicketAction({ kind: "create", ticket: triaged })).toBe(true);
    expect(isTicketAction({ kind: "create", ticket: { ...created, status: "--json" } })).toBe(false);
  });

  it("tells dryland not to commit when auto-commit is off", () => {
    expect(trackerArgs({ kind: "claim", ticket }, false)).toEqual(["ticket", "claim", "shop/02", "--no-commit"]);
  });
});

describe("creating on a state store", () => {
  const created = {
    map: "shop",
    title: "Pay by card",
    type: "grilling" as const,
    question: "Which cards?",
    blockedBy: ["02", "03"],
    status: "needs-triage" as const,
  };

  it("pipes one ticket document to `ticket create` and passes no commit flag", () => {
    const action = { kind: "create" as const, ticket: created };
    expect(trackerArgs(action, true, true)).toEqual(["ticket", "create"]);
    expect(JSON.parse(trackerInput(action, true) ?? "null")).toEqual({
      effort: "shop",
      title: "Pay by card",
      type: "grilling",
      report: "Which cards?",
      blockedBy: ["shop/02", "shop/03"],
      triageRole: "needs-triage",
    });
  });

  it("leaves out an empty question, no blockers and no role, and sends nothing for a markdown repo", () => {
    const action = { kind: "create" as const, ticket: { ...created, question: "", blockedBy: [], status: undefined } };
    expect(JSON.parse(trackerInput(action, true) ?? "null")).toEqual({
      effort: "shop",
      title: "Pay by card",
      type: "grilling",
    });
    expect(trackerInput(action, false)).toBeNull();
    expect(trackerInput({ kind: "claim", ticket }, true)).toBeNull();
  });

  it("creates a map from a document of effort, title and destination", () => {
    const action = {
      kind: "create-map" as const,
      map: { map: "shop", title: "Shop", destination: "Sell things." },
    };
    expect(trackerArgs(action, true, true)).toEqual(["map", "create"]);
    expect(JSON.parse(trackerInput(action, true) ?? "null")).toEqual({
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

describe("autoCommitFor", () => {
  it("uses the project's override when it has one, the global setting otherwise", () => {
    const settings = { autoCommit: false, projectAutoCommit: { "/repos/shop": true } };
    expect(autoCommitFor(settings, "/repos/shop")).toBe(true);
    expect(autoCommitFor(settings, "/repos/blog")).toBe(false);
    expect(autoCommitFor({ autoCommit: true, projectAutoCommit: {} }, "/repos/blog")).toBe(true);
  });
});

describe("CONFIRMATION_TYPES", () => {
  it("names the three kinds of confirmed write", () => {
    expect(CONFIRMATION_TYPES).toEqual(["tracker-metadata", "user-config", "prose-annotation"]);
  });
});
