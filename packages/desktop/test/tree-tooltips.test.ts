import type { TreeTicket } from "@dryland/core";
import { describe, expect, it } from "vitest";
import { fogLabel, mapTooltip, ticketTooltip } from "../src/shared/tree-tooltips.ts";

const ticket: Pick<TreeTicket, "id" | "title" | "status" | "claimant" | "blockers"> = {
  id: "93",
  title: "Diagnose tooltips",
  status: "ready",
  claimant: null,
  blockers: [],
};

describe("ticketTooltip", () => {
  it("gives every ticket a tooltip with its id, full title and status", () => {
    expect(ticketTooltip(ticket, undefined)).toBe("93 Diagnose tooltips\nReady");
  });

  it("adds the claimant and the blockers", () => {
    const held = { ...ticket, status: "blocked" as const, claimant: "main", blockers: ["80", "81"] };
    expect(ticketTooltip(held, undefined)).toBe("93 Diagnose tooltips\nBlocked\nclaimed by main\nblocked by 80, 81");
  });

  it("says when the blockers are unknown", () => {
    expect(ticketTooltip({ ...ticket, blockers: "unknown" }, undefined)).toContain("blocked by: unknown");
  });

  it("ends with the Next-up reason", () => {
    expect(ticketTooltip(ticket, "Resolve it next")).toBe("93 Diagnose tooltips\nReady\nResolve it next");
  });
});

describe("fogLabel", () => {
  it("keeps a short item whole", () => {
    expect(fogLabel("Auto-update channels")).toBe("Auto-update channels");
  });

  it("stops at the first colon", () => {
    expect(fogLabel("Packaging: installers for three OSes, signing and updates")).toBe("Packaging");
  });

  it("stops at the end of the first sentence", () => {
    expect(fogLabel("Hooks may differ per CLI. We have not checked Copilot yet.")).toBe("Hooks may differ per CLI");
  });

  it("does not split on a dot inside a word", () => {
    expect(fogLabel("Supports v1.2 of the schema")).toBe("Supports v1.2 of the schema");
  });

  it("falls back to the whole text when the first part is empty", () => {
    expect(fogLabel(": odd item")).toBe(": odd item");
  });

  it("flattens line breaks", () => {
    expect(fogLabel("First line\nsecond line")).toBe("First line second line");
  });
});

describe("mapTooltip", () => {
  it("names the map and its title", () => {
    expect(mapTooltip("mattpocock-ade", "Matt Pocock ADE")).toBe("Matt Pocock ADE\nmattpocock-ade");
  });
});
