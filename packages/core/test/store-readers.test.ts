import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  claimStoreTicket,
  commentOnStoreTicket,
  createStoreTicket,
  resolveStoreTicket,
  storeDir,
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

const readTicketsTree = async (root: string) => (await readProjectState(nodeProcessRunner, root)).tree;

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

describe("the project state of a store with only open tickets", () => {
  it("shows an effort without a map as a standalone group, and leaves sessions unknown when given none", async () => {
    const root = await storeRepo([
      { effort: "blog", tickets: [{ title: "Write post" }, { title: "Edit post", blockedBy: [1] }] },
    ]);

    const { tree, snapshot } = await readProjectState(nodeProcessRunner, root);

    expect(tree.maps).toMatchObject([{ name: "blog", title: "blog", fog: [] }]);
    expect(tree.maps[0]?.implementation.map((t) => [t.id, t.status])).toEqual([
      ["01", "ready"],
      ["02", "blocked"],
    ]);
    expect(snapshot.sessions).toBeNull();
    expect(nextSteps(snapshot)).toEqual([]);
  });

  it("lists no ticket claimed and no stale claim for live sessions that are given", async () => {
    const root = await storeRepo([SHOP]);

    const { snapshot } = await readProjectState(nodeProcessRunner, root, []);

    expect(nextSteps(snapshot).map((s) => s.ruleId)).toEqual(["map-frontier"]);
  });
});

describe("claimed and resolved tickets on a store", () => {
  const as = { author: "engine" } as const;
  const claimedShop = async () => {
    const root = await storeRepo([
      { effort: "shop", map: { title: "Shop" }, tickets: ["A", "B", "C", "D", "E"].map((title) => ({ title })) },
    ]);
    for (const id of ["01", "02", "03", "04", "05"].slice(1)) {
      await claimStoreTicket(root, `shop/${id}`, { ...as, holder: `shop/${id}-branch` });
    }
    return root;
  };

  it("derives status and claimant, folds a resolved ticket into done and unblocks its dependants", async () => {
    const root = await storeRepo([
      { effort: "shop", tickets: [{ title: "A" }, { title: "B", blockedBy: [1] }, { title: "C", blockedBy: [2, 1] }] },
    ]);
    await resolveStoreTicket(root, "shop/01", "Done.", as);
    await claimStoreTicket(root, "shop/02", { ...as, holder: "shop/02-b" });

    const [shop] = (await readTicketsTree(root)).maps;

    expect(shop?.done.map((t) => t.id)).toEqual(["01"]);
    const byId = Object.fromEntries((shop?.implementation ?? []).map((t) => [t.id, t]));
    expect(byId["02"]).toMatchObject({ status: "in-progress", claimant: "shop/02-b", blockers: [] });
    expect(byId["03"]).toMatchObject({ status: "blocked", blockers: ["02"] });
    expect(await readTicketDetail(root, "shop", "01")).toMatchObject({ status: "done" });
  });

  it("calls a claim stale when neither a live session nor the session index knows it", async () => {
    const root = await storeRepo([{ effort: "shop", tickets: [{ title: "A" }] }]);
    await claimStoreTicket(root, "shop/01", { ...as, holder: "gone-session" });

    const { snapshot } = await readProjectState(nodeProcessRunner, root, []);

    expect(nextSteps(snapshot).map((s) => s.ruleId)).toEqual(["stale-claim"]);
    const live = [{ id: "s1", ticket: { map: "shop", id: "01" }, state: "running" as const }];
    expect(nextSteps((await readProjectState(nodeProcessRunner, root, live)).snapshot)).toEqual([]);
  });

  it("feeds live sessions into the snapshot and reads an indexed claim with no live session as paused", async () => {
    const root = await claimedShop();
    const dir = await storeDir(root);
    const seen = (sessionId: string, lastState?: string) => [
      { adapter: "claude-code", sessionId, lastSeen: "2026-10-15T09:00:00.000Z", ...(lastState ? { lastState } : {}) },
    ];
    mkdirSync(join(dir ?? "", "dryland"), { recursive: true });
    writeFileSync(
      join(dir ?? "", "dryland", "sessions.json"),
      JSON.stringify({ items: { "shop/02": seen("c2", "waiting"), "shop/03": seen("c3", "running") } }),
    );
    const sessions = [{ id: "s4", ticket: { map: "shop", id: "04" }, state: "waiting" as const }];

    const { snapshot } = await readProjectState(nodeProcessRunner, root, sessions);

    expect(snapshot.sessions).toEqual([
      ...sessions,
      { id: "c2", ticket: { map: "shop", id: "02" }, state: "paused", was: "waiting" },
      { id: "c3", ticket: { map: "shop", id: "03" }, state: "paused", was: "interrupted" },
    ]);
    expect(nextSteps(snapshot).map((s) => s.ruleId)).toEqual([
      "waiting-session",
      "paused-was-waiting",
      "stale-claim",
      "map-frontier",
    ]);
    expect((await readProjectState(nodeProcessRunner, root)).snapshot.sessions).toBeNull();
  });

  it("shows the claim holder, answer and comments on the ticket tab", async () => {
    const root = await storeRepo([{ effort: "shop", tickets: [{ title: "A" }, { title: "B" }] }]);
    await claimStoreTicket(root, "shop/01", { ...as, holder: "shop/01-a" });
    await commentOnStoreTicket(root, "shop/01", "A note.", as);
    await resolveStoreTicket(root, "shop/02", "Because.", as);

    expect(await readTicketDetail(root, "shop", "01")).toMatchObject({ claimant: "shop/01-a", comments: ["A note."] });
    expect(await readTicketDetail(root, "shop", "02")).toMatchObject({ status: "done", answer: "Because." });
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

  it("names the state store as the tracker, with no lens mode and no default-branch note", async () => {
    const root = await storeRepo([SHOP]);

    expect(await readTrackerWidget(nodeProcessRunner, root)).toEqual({
      kind: "state-store",
      lens: false,
      offDefaultBranch: null,
    });
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
