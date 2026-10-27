import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  claimStoreTicket,
  decisionsOf,
  type FixtureEffort,
  firstSentence,
  nextSteps,
  nodeProcessRunner,
  readEfforts,
  readMapDetail,
  readProjectState,
  resolveStoreTicket,
  seedStore,
  showStoreMap,
} from "../src/index.ts";

const as = { author: "engine" } as const;

async function storeRepo(efforts: FixtureEffort[]): Promise<string> {
  process.env["DRYLAND_DATA_DIR"] ??= mkdtempSync(join(tmpdir(), "dryland-data-"));
  const path = mkdtempSync(join(tmpdir(), "dryland-store-maps-"));
  execFileSync("git", ["init", "--quiet", "--initial-branch=main"], { cwd: path });
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "--allow-empty", "-qm", "init"], {
    cwd: path,
  });
  await seedStore(path, efforts);
  return path;
}

const SHOP: FixtureEffort = {
  effort: "shop",
  map: {
    title: "Shop",
    destination: "Sell things.",
    notes: "Keep it small.",
    fog: ["Payments"],
    outOfScope: ["Mobile app"],
  },
  tickets: [
    { title: "Pick a database", type: "grilling" },
    { title: "Build the cart", blockedBy: [1] },
    { title: "Write the docs" },
    { title: "Ship the checkout", blockedBy: [1] },
  ],
};

describe("firstSentence", () => {
  it("takes text up to the first sentence end and joins wrapped lines", () => {
    expect(firstSentence("Carts live on\nthe server. They expire. Later.")).toBe("Carts live on the server.");
  });

  it("keeps a decimal point inside the sentence and a summary without an end as is", () => {
    expect(firstSentence("Use v1.2 of the API")).toBe("Use v1.2 of the API");
    expect(firstSentence("")).toBe("");
  });
});

describe("Decisions so far, derived from resolved tickets", () => {
  it("lists title plus the first sentence of the summary, in ticket order, for resolved tickets only", async () => {
    const root = await storeRepo([SHOP]);
    await resolveStoreTicket(root, "shop/03", "Docs are markdown. Nothing else.", as);
    await resolveStoreTicket(root, "shop/01", "Postgres. It is boring.", as);

    const efforts = await readEfforts(root);

    expect(efforts.find((e) => e.name === "shop")?.map?.decisions).toEqual([
      "Pick a database: Postgres.",
      "Write the docs: Docs are markdown.",
    ]);
  });

  it("is empty before anything is resolved, and decisionsOf reads one effort only", async () => {
    const root = await storeRepo([SHOP, { effort: "blog", map: { title: "Blog" }, tickets: [{ title: "Post" }] }]);
    await resolveStoreTicket(root, "blog/01", "Posted.", as);

    const { snapshot } = await readProjectState(nodeProcessRunner, root);

    expect(snapshot.efforts.find((e) => e.name === "shop")?.map?.decisions).toEqual([]);
    expect(snapshot.efforts.find((e) => e.name === "blog")?.map?.decisions).toEqual(["Post: Posted."]);
    expect(decisionsOf([], "shop")).toEqual([]);
  });

  it("is part of the map document", async () => {
    const root = await storeRepo([SHOP]);
    await resolveStoreTicket(root, "shop/01", "Postgres.", as);

    const document = await showStoreMap(root, "shop");

    expect(document.decisions).toEqual(["Pick a database: Postgres."]);
  });
});

describe("the map tab on a store", () => {
  it("shows Destination, Notes, frontier, blocked and claimed, Decisions so far, fog and out of scope", async () => {
    const root = await storeRepo([SHOP]);
    await resolveStoreTicket(root, "shop/01", "Postgres. Boring.", as);
    await claimStoreTicket(root, "shop/03", { ...as, holder: "shop/03-docs" });

    const detail = await readMapDetail(root, "shop");

    expect(detail?.markdown).toBe(
      [
        "# Map: Shop",
        "## Destination\n\nSell things.",
        "## Notes\n\nKeep it small.",
        "## Frontier\n\n- 02 Build the cart\n- 04 Ship the checkout",
        "## Claimed\n\n- 03 Write the docs (shop/03-docs)",
        "## Decisions so far\n\n- Pick a database: Postgres.",
        "## Not yet specified\n\n- Payments",
        "## Out of scope\n\n- Mobile app",
      ].join("\n\n"),
    );
  });

  it("lists a ticket with an open blocker under Blocked, and leaves empty sections out", async () => {
    const root = await storeRepo([
      {
        effort: "shop",
        map: { title: "Shop", destination: "D" },
        tickets: [{ title: "A" }, { title: "B", blockedBy: [1] }],
      },
    ]);

    const detail = await readMapDetail(root, "shop");

    expect(detail?.markdown).toContain("## Frontier\n\n- 01 A");
    expect(detail?.markdown).toContain("## Blocked\n\n- 02 B (waits for 01)");
    expect(detail?.markdown).not.toContain("## Claimed");
    expect(detail?.markdown).not.toContain("## Decisions so far");
    expect(detail?.markdown).not.toContain("## Out of scope");
  });
});

describe("the next step of a fresh repo", () => {
  it("is `dryland init` when the repo has no store", async () => {
    const path = mkdtempSync(join(tmpdir(), "dryland-fresh-"));
    execFileSync("git", ["init", "--quiet", "--initial-branch=main"], { cwd: path });
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "--allow-empty", "-qm", "init"], {
      cwd: path,
    });

    const { snapshot } = await readProjectState(nodeProcessRunner, path);

    expect(nextSteps(snapshot).map((s) => [s.ruleId, s.command])).toEqual([["no-setup-config", "dryland init"]]);
  });

  it("is not recommended once the store exists", async () => {
    const root = await storeRepo([]);

    const { snapshot } = await readProjectState(nodeProcessRunner, root);

    expect(nextSteps(snapshot)).toEqual([]);
  });
});
