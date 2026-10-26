import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createStoreTicket,
  createWorktree,
  type FixtureEffort,
  nextSteps,
  nodeProcessRunner,
  readEfforts,
  readMapDetail,
  readProjectState,
  readStoreHead,
  readTicketDetail,
  readTrackerWidget,
  seedStore,
  showMap,
  specsWithoutTickets,
} from "../src/index.ts";

async function storeRepo(efforts: FixtureEffort[], files: Record<string, string> = {}): Promise<string> {
  process.env["DRYLAND_DATA_DIR"] ??= mkdtempSync(join(tmpdir(), "dryland-data-"));
  const path = mkdtempSync(join(tmpdir(), "dryland-store-read-"));
  execFileSync("git", ["init", "--quiet", "--initial-branch=main"], { cwd: path });
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "--allow-empty", "-qm", "init"], {
    cwd: path,
  });
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(path, file)), { recursive: true });
    writeFileSync(join(path, file), content);
  }
  await seedStore(path, efforts);
  return path;
}

const SHOP: FixtureEffort = {
  effort: "shop",
  map: { title: "Shop", destination: "Sell things.", fog: ["Payments"] },
  tickets: [
    { title: "Grill the cart", type: "grilling" },
    {
      title: "Build the cart",
      criteria: [{ text: "Adds items", done: true }, { text: "Removes items" }],
      blockedBy: [1],
      triageRole: "ready-for-agent",
    },
  ],
};

describe("the tickets tree and snapshot on a store", () => {
  it("groups tickets by effort and kind, with the map's title and fog, and no tracker doc", async () => {
    const root = await storeRepo([SHOP, { effort: "blog", tickets: [{ title: "Write post" }] }]);

    const { tree, snapshot } = await readProjectState(nodeProcessRunner, root);

    expect(tree.maps.map((m) => [m.name, m.title, m.fog])).toEqual([
      ["blog", "blog", []],
      ["shop", "Shop", ["Payments"]],
    ]);
    const shop = tree.maps[1];
    expect(shop?.planning.map((t) => [t.title, t.status])).toEqual([["Grill the cart", "ready"]]);
    expect(shop?.implementation.map((t) => [t.title, t.status, t.blockers])).toEqual([
      ["Build the cart", "blocked", ["01"]],
    ]);
    expect(snapshot.setupConfigPresent).toBe(true);
    expect(snapshot.efforts.map((e) => [e.name, e.map?.title ?? null])).toEqual([["shop", "Shop"]]);
  });

  it("calls a ticket that links its spec a slice of the spec, and one without a spec link a decision", async () => {
    const root = await storeRepo(
      [
        {
          effort: "shop",
          map: { title: "Shop" },
          tickets: [
            { title: "Decide the cart", report: "## Question\n\nWhich cart?" },
            { title: "Build the cart", spec: ".scratch/shop/spec.md" },
          ],
        },
      ],
      { ".scratch/shop/spec.md": "# Shop\n" },
    );

    const { snapshot } = await readProjectState(nodeProcessRunner, root);

    // The decision ticket is not slice work; the linked one is, so the spec counts as sliced into tickets.
    expect(nextSteps(snapshot).map((s) => [s.ruleId, s.target])).toEqual([
      ["map-frontier", { kind: "ticket", map: "shop", id: "01" }],
    ]);
    expect(snapshot.efforts[0]?.hasSpec).toBe(true);
  });

  it("raises spec-without-tickets for a spec file whose effort has no tickets", async () => {
    const root = await storeRepo([], { ".scratch/blog/spec.md": "# Blog\n" });

    const { snapshot } = await readProjectState(nodeProcessRunner, root);

    expect(nextSteps(snapshot).map((s) => [s.ruleId, s.target])).toEqual([
      ["spec-without-tickets", { kind: "spec", map: "blog" }],
    ]);
    expect(await specsWithoutTickets(nodeProcessRunner, root)).toEqual(["blog"]);
    expect(await readEfforts(root)).toMatchObject([{ name: "blog", map: null, hasSpec: true }]);
  });

  it("shows a map with its destination, fog and tickets", async () => {
    const root = await storeRepo([SHOP]);

    const map = await showMap(nodeProcessRunner, root, "shop");

    expect(map).toMatchObject({ name: "shop", title: "Shop", destination: "Sell things.", fog: ["Payments"] });
    expect(map.tickets.map((t) => t.title)).toEqual(["Grill the cart", "Build the cart"]);
  });
});

describe("the item tabs on a store", () => {
  it("shows a ticket with its criteria, triage role, claim holder and blockers", async () => {
    const root = await storeRepo([SHOP]);

    const detail = await readTicketDetail(root, "shop", "02");

    expect(detail).toMatchObject({
      title: "Build the cart",
      mapTitle: "Shop",
      status: "blocked",
      blockers: ["01"],
      claimant: null,
      triageRole: "ready-for-agent",
    });
    expect(detail?.body).toContain("- [x] Adds items\n- [ ] Removes items");
    expect(await readTicketDetail(root, "shop", "09")).toBeNull();
  });

  it("shows a map as markdown, and nothing for an effort that has no map", async () => {
    const root = await storeRepo([SHOP, { effort: "blog", tickets: [{ title: "Write post" }] }]);

    const map = await readMapDetail(root, "shop");

    expect(map).toMatchObject({ name: "shop", title: "Shop" });
    expect(map?.markdown).toContain("Sell things.");
    expect(map?.markdown).toContain("- Payments");
    expect(await readMapDetail(root, "blog")).toBeNull();
  });
});

describe("worktrees and the tracker widget on a store", () => {
  it("names a ticket's worktree after its title", async () => {
    const root = await storeRepo([SHOP]);

    const result = await createWorktree(nodeProcessRunner, root, { ticket: "shop/01" });

    expect(result.branch).toBe("shop/01-grill-the-cart");
  });

  it("has no tracker widget, since the store has no tracker doc or default-branch concern", async () => {
    const root = await storeRepo([SHOP]);

    expect(await readTrackerWidget(nodeProcessRunner, root)).toBeNull();
  });
});

describe("readStoreHead", () => {
  it("is null without a store and moves when an event is written", async () => {
    const root = await storeRepo([SHOP]);
    const before = await readStoreHead(root);
    expect(before).not.toBeNull();

    await createStoreTicket(root, JSON.stringify({ effort: "shop", title: "More", type: "task" }), {
      author: "engine",
    });

    expect(await readStoreHead(root)).not.toBe(before);
  });
});
