import { describe, expect, it } from "vitest";
import {
  autoCommitFor,
  commandLine,
  CONFIRMATION_TYPES,
  isTicketAction,
  trackerArgs,
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

  it("tells dryland not to commit when auto-commit is off", () => {
    expect(trackerArgs({ kind: "claim", ticket }, false)).toEqual(["ticket", "claim", "shop/02", "--no-commit"]);
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
