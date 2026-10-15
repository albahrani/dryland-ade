import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { nodeProcessRunner, readProjectState } from "../src/index.ts";

const readTicketsTree = async (root: string) => (await readProjectState(nodeProcessRunner, root)).tree;

const TRACKER = "# Issue tracker: Local markdown\n";

function checkout(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "dryland-tree-"));
  for (const [file, content] of Object.entries({ "docs/agents/issue-tracker.md": TRACKER, ...files })) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  }
  return root;
}

const ticket = (title: string, ...header: string[]) => `# ${title}\n\n${header.join("\n")}\n\n## Question\n\nQ\n`;

describe("the tickets tree of readProjectState", () => {
  it("groups tickets by map, then by kind, and lists the map's fog", async () => {
    const root = checkout({
      ".scratch/shop/map.md": "# Map: Shop\n\n## Destination\n\nSell.\n\n## Not yet specified\n\n- Payments\n",
      ".scratch/shop/issues/01-grill.md": ticket("Grill cart", "Type: grilling", "Status: ready-for-agent"),
      ".scratch/shop/issues/02-cart.md": ticket("Build cart", "Type: task", "Status: ready-for-agent"),
      ".scratch/blog/issues/01-post.md": ticket("Write post", "Type: task", "Status: ready-for-agent"),
    });

    const tree = await readTicketsTree(root);

    expect(tree.maps.map((m) => m.name)).toEqual(["blog", "shop"]);
    const shop = tree.maps.find((m) => m.name === "shop")!;
    expect(shop.title).toBe("Shop");
    expect(shop.fog).toEqual(["Payments"]);
    expect(shop.planning.map((t) => t.title)).toEqual(["Grill cart"]);
    expect(shop.implementation.map((t) => t.title)).toEqual(["Build cart"]);
    expect(tree.maps.find((m) => m.name === "blog")!.title).toBe("blog");
  });

  it("derives status, claimant and unresolved blockers, and folds done tickets", async () => {
    const root = checkout({
      ".scratch/shop/issues/01-a.md": ticket("A", "Type: task", "Status: resolved"),
      ".scratch/shop/issues/02-b.md": ticket("B", "Type: task", "Status: ready-for-agent", "Blocked by: 01"),
      ".scratch/shop/issues/03-c.md": ticket("C", "Type: task", "Status: ready-for-agent", "Blocked by: 02, 01"),
      ".scratch/shop/issues/04-d.md": ticket(
        "D",
        "Type: task",
        "Status: claimed",
        '<!-- dryland: {"claim":{"holder":"shop/04-d","at":"2026-01-01T00:00:00Z","was":"ready-for-agent"}} -->',
      ),
    });

    const [shop] = (await readTicketsTree(root)).maps;

    expect(shop!.done.map((t) => t.id)).toEqual(["01"]);
    const byId = Object.fromEntries(shop!.implementation.map((t) => [t.id, t]));
    expect(byId["02"]).toMatchObject({ status: "ready", blockers: [] });
    expect(byId["03"]).toMatchObject({ status: "blocked", blockers: ["02"] });
    expect(byId["04"]).toMatchObject({ status: "in-progress", claimant: "shop/04-d" });
  });
});
