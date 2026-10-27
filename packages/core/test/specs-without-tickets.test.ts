import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { findSpecsWithoutTickets, type Ticket } from "../src/index.ts";

function checkout(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "dryland-specs-"));
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  }
  return root;
}

const ticketOf = (map: string): Ticket => ({
  id: "01",
  map,
  title: "First",
  type: "task",
  state: "open",
  claimant: null,
  blockers: [],
  triageRole: null,
  body: "",
  answer: null,
  comments: [],
});

describe("findSpecsWithoutTickets", () => {
  it("reports efforts that have a spec and no tickets, and only those", async () => {
    const root = checkout({
      ".scratch/fresh/spec.md": "# Spec\n",
      ".scratch/sliced/spec.md": "# Spec\n",
      ".scratch/notes-only/map.md": "# Map: Notes\n",
    });

    expect(await findSpecsWithoutTickets(root, [ticketOf("sliced")])).toEqual(["fresh"]);
  });

  it("is empty when there is no .scratch directory", async () => {
    expect(await findSpecsWithoutTickets(checkout({}), [])).toEqual([]);
  });
});
