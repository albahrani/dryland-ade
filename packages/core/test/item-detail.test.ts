import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { readMapDetail, readTicketDetail } from "../src/index.ts";

const TRACKER = "# Issue tracker: Local markdown\n";

function checkout(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "dryland-detail-"));
  for (const [file, content] of Object.entries({ "docs/agents/issue-tracker.md": TRACKER, ...files })) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  }
  return root;
}

const MAP = "# Map: Shop\n\n## Destination\n\nSell things.\n\n## Not yet specified\n\n- Payments\n";

describe("readTicketDetail", () => {
  it("returns header fields, body, answer and comments, with blockers narrowed to unresolved ones", async () => {
    const root = checkout({
      ".scratch/shop/map.md": MAP,
      ".scratch/shop/issues/01-a.md": "# A\n\nType: task\nStatus: resolved\n\n## What to build\n\nDone.\n",
      ".scratch/shop/issues/02-b.md": "# B\n\nType: task\nStatus: ready-for-agent\n\n## Question\n\nQ\n",
      ".scratch/shop/issues/03-c.md": [
        "# C",
        "",
        "Type: task",
        "Status: ready-for-agent",
        "Blocked by: 01, 02",
        "",
        "## What to build",
        "",
        "Build the cart.",
        "",
        "## Answer",
        "",
        "Built it.",
        "",
        "## Comments",
        "",
        "Looks good.",
        "",
      ].join("\n"),
    });

    const detail = await readTicketDetail(root, "shop", "03");

    expect(detail).toMatchObject({
      id: "03",
      map: "shop",
      mapTitle: "Shop",
      title: "C",
      type: "task",
      status: "blocked",
      claimant: null,
      blockers: ["02"],
      answer: "Built it.",
      comments: ["Looks good."],
    });
    expect(detail?.body).toContain("Build the cart.");
  });

  it("falls back to the map name for the title when the map has no map.md", async () => {
    const root = checkout({
      ".scratch/blog/issues/01-post.md": "# Post\n\nType: task\nStatus: ready-for-agent\n\n## Question\n\nQ\n",
    });

    expect(await readTicketDetail(root, "blog", "01")).toMatchObject({ mapTitle: "blog", status: "ready" });
  });

  it("returns null for a ticket that does not exist", async () => {
    const root = checkout({ ".scratch/shop/map.md": MAP });

    expect(await readTicketDetail(root, "shop", "09")).toBeNull();
  });
});

describe("readMapDetail", () => {
  it("returns the map's title and markdown", async () => {
    const root = checkout({ ".scratch/shop/map.md": MAP });

    expect(await readMapDetail(root, "shop")).toEqual({ name: "shop", title: "Shop", markdown: MAP });
  });

  it("returns null for a map without a map.md", async () => {
    expect(await readMapDetail(checkout({}), "shop")).toBeNull();
  });
});
