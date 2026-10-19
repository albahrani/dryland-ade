import { describe, expect, it } from "vitest";
import { chosenSkillCommand, isSkillChoice, isWorkTarget, sessionTitle } from "../src/shared/work-target.ts";

const agent = { name: "Claude Code" };

describe("isWorkTarget", () => {
  it("accepts a ticket, a map and a new map, and refuses anything else from the renderer", () => {
    expect(isWorkTarget({ kind: "ticket", ticket: { map: "shop", id: "02" } })).toBe(true);
    expect(isWorkTarget({ kind: "map", map: "shop" })).toBe(true);
    expect(isWorkTarget({ kind: "new-map" })).toBe(true);
    expect(isWorkTarget({ kind: "scratch" })).toBe(true);
    expect(isWorkTarget({ kind: "map", map: "--json" })).toBe(false);
    expect(isWorkTarget({ kind: "ticket", ticket: { map: "shop" } })).toBe(false);
    expect(isWorkTarget({ map: "shop", id: "02" })).toBe(false);
  });
});

describe("isSkillChoice", () => {
  it("takes a skill name or null for the recommended command", () => {
    expect(isSkillChoice(null)).toBe(true);
    expect(isSkillChoice("grilling")).toBe(true);
    expect(isSkillChoice("grill me")).toBe(false);
    expect(isSkillChoice("-x")).toBe(false);
    expect(isSkillChoice(undefined)).toBe(false);
  });
});

describe("chosenSkillCommand", () => {
  it("names what the session works on, so the user only edits what they want to", () => {
    expect(chosenSkillCommand("grilling", { kind: "ticket", ticket: { map: "shop", id: "02" } })).toBe(
      "/grilling shop/02",
    );
    expect(chosenSkillCommand("grilling", { kind: "map", map: "shop" })).toBe("/grilling shop");
    expect(chosenSkillCommand("grilling", { kind: "new-map" })).toBe("/grilling ");
    expect(chosenSkillCommand("grilling", { kind: "scratch" })).toBe("/grilling ");
  });
});

describe("sessionTitle", () => {
  it("names the agent and its ticket, map or new map", () => {
    expect(sessionTitle({ agent, ticket: { map: "shop", id: "02" }, map: "shop" })).toBe("Claude Code shop/02");
    expect(sessionTitle({ agent, ticket: null, map: "shop" })).toBe("Claude Code shop");
    expect(sessionTitle({ agent, ticket: null, map: null })).toBe("Claude Code new map");
    expect(sessionTitle({ agent, ticket: null, map: null, worktree: { branch: "scratch/scratch-session" } })).toBe(
      "Claude Code scratch",
    );
  });
});
