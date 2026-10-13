import { describe, expect, it } from "vitest";
import { TempRepo } from "./harness.ts";

const LOCAL_TRACKER_DOC = "# Issue tracker: Local Markdown\n\nIssues live in `.scratch/`.\n";
const MAP_PATH = ".scratch/shop/map.md";
const ENTRY = ["--title", "Cart storage", "--link", "issues/01-cart.md", "--gist", "Carts live on the server."];

const FRESH_MAP = "# Map: Shop\n\n## Destination\n\nA shop.\n\n## Decisions so far\n\nNothing.\n";
const BUSY_MAP = [
  "# Map: Shop",
  "",
  "## Destination",
  "",
  "A shop.\r",
  "",
  "## Notes",
  "",
  "- Hand-written note.",
  "",
  "## Decisions so far",
  "",
  "- [Payments](issues/02-pay.md): Stripe.",
  "",
  "- [Search](issues/03-search.md): Postgres full text.",
  "",
  "## Not yet specified",
  "",
  "- Shipping.",
  "",
].join("\n");

function shopRepo(map: string): TempRepo {
  return TempRepo.create({
    "docs/agents/issue-tracker.md": LOCAL_TRACKER_DOC,
    [MAP_PATH]: map,
    ".scratch/shop/issues/01-cart.md": "# Cart\n\nType: task\n",
  });
}

describe("dryland map index", () => {
  it("appends one entry that map show reads back, and commits only the map", async () => {
    const repo = shopRepo(FRESH_MAP);
    repo.write("unrelated.txt", "dirty");

    const result = await repo.run(["map", "index", "shop", ...ENTRY]);

    expect(result.exitCode).toBe(0);
    const shown = JSON.parse((await repo.run(["map", "show", "shop", "--json"])).stdout);
    expect(shown.decisions).toEqual(["[Cart storage](issues/01-cart.md): Carts live on the server."]);
    expect(repo.log()[0]).toBe("Index \"Cart storage\" in the shop map");
    expect(repo.git("status", "--porcelain")).toBe("?? unrelated.txt");
  });

  it("leaves every other line of the map byte-identical", async () => {
    const repo = shopRepo(BUSY_MAP);

    const result = await repo.run(["map", "index", "shop", ...ENTRY]);

    expect(result.exitCode).toBe(0);
    const entry = "- [Cart storage](issues/01-cart.md): Carts live on the server.";
    expect(repo.read(MAP_PATH)).toBe(
      BUSY_MAP.replace("\n## Not yet specified", `\n${entry}\n\n## Not yet specified`),
    );
  });

  it("fails for an unknown map and states the next action", async () => {
    const repo = shopRepo(FRESH_MAP);

    const result = await repo.run(["map", "index", "nope", ...ENTRY]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("Next:");
  });
});

describe("dryland map index placeholder", () => {
  it("keeps a real first decision that merely starts with None", async () => {
    const repo = shopRepo(FRESH_MAP.replace("Nothing.", "None of the options fit; revisit later."));

    await repo.run(["map", "index", "shop", ...ENTRY]);

    const map = repo.read(MAP_PATH);
    expect(map).toContain("None of the options fit; revisit later.\n- [Cart storage]");
  });
});

describe("dryland map index validation", () => {
  it("rejects a title with square brackets and changes nothing", async () => {
    const repo = shopRepo(FRESH_MAP);

    const result = await repo.run(["map", "index", "shop", "--title", "Use [x] syntax", "--link", "a.md", "--gist", "g"]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("Next:");
    expect(repo.git("status", "--porcelain")).toBe("");
  });
});
