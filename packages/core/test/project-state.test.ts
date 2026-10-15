import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { nextSteps, nodeProcessRunner, readProjectState } from "../src/index.ts";

function checkout(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "dryland-project-state-"));
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  }
  return root;
}

const ticket = (title: string, ...header: string[]) => `# ${title}\n\n${header.join("\n")}\n\n## Question\n\nWhat?\n`;

describe("readProjectState", () => {
  it("reads the tickets tree and the repo snapshot from one pass over the tracker files", async () => {
    const root = checkout({
      "docs/agents/issue-tracker.md": "# Issue tracker: Local markdown\n",
      ".scratch/shop/map.md": "# Map: Shop\n\n## Not yet specified\n\n- Payments\n",
      ".scratch/shop/issues/01-cart.md": ticket("Grill the cart", "Type: grilling"),
      ".scratch/blog/spec.md": "# Blog\n",
    });

    const { tree, snapshot } = await readProjectState(nodeProcessRunner, root);

    expect(tree.maps.map((m) => [m.name, m.title, m.fog])).toEqual([
      ["blog", "blog", []],
      ["shop", "Shop", ["Payments"]],
    ]);
    expect(tree.maps[1]?.planning.map((t) => t.title)).toEqual(["Grill the cart"]);
    expect(snapshot.efforts.map((e) => [e.name, e.hasSpec, e.map?.fog.length ?? null])).toEqual([
      ["blog", true, null],
      ["shop", false, 1],
    ]);
    expect(nextSteps(snapshot).map((s) => [s.ruleId, s.target])).toEqual([
      ["map-frontier", { kind: "ticket", map: "shop", id: "01" }],
      ["spec-without-tickets", { kind: "spec", map: "blog" }],
    ]);
  });
});
