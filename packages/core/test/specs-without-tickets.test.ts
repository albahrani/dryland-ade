import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { findSpecsWithoutTickets, readLocalMarkdownTickets } from "../src/index.ts";

function checkout(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "dryland-specs-"));
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  }
  return root;
}

describe("findSpecsWithoutTickets", () => {
  it("reports efforts that have a spec and no tickets, and only those", async () => {
    const root = checkout({
      ".scratch/fresh/spec.md": "# Spec\n",
      ".scratch/sliced/spec.md": "# Spec\n",
      ".scratch/sliced/issues/01-first.md": "# First\n\nType: task\n",
      ".scratch/notes-only/map.md": "# Map: Notes\n",
    });

    const tickets = await readLocalMarkdownTickets(root);

    expect(await findSpecsWithoutTickets(root, tickets)).toEqual(["fresh"]);
  });

  it("is empty when there is no .scratch directory", async () => {
    expect(await findSpecsWithoutTickets(checkout({}), [])).toEqual([]);
  });
});
