import { describe, expect, it } from "vitest";
import { TempRepo } from "./harness.ts";

const SHOP = {
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
    { title: "Ship the checkout", blockedBy: [3] },
  ],
};

describe("dryland map show on a store", () => {
  it("returns Decisions so far, derived from resolved tickets, in the document", async () => {
    const repo = await TempRepo.createStore([SHOP]);
    await repo.run(["ticket", "resolve", "shop/01", "--answer", "Postgres. It is boring."]);

    const shown = JSON.parse((await repo.run(["map", "show", "shop"])).stdout);

    expect(shown.decisions).toEqual(["Pick a database: Postgres."]);
  });

  it("prints Destination, Notes, frontier, blocked, claimed, Decisions so far, fog and out of scope as text", async () => {
    const repo = await TempRepo.createStore([SHOP]);
    await repo.run(["ticket", "resolve", "shop/01", "--answer", "Postgres. It is boring."]);
    await repo.run(["ticket", "claim", "shop/03"]);

    const text = (await repo.run(["map", "show", "shop", "--text"])).stdout;

    expect(text).toContain("Destination: Sell things.");
    expect(text).toContain("Notes: Keep it small.");
    expect(text).toMatch(/Frontier:\n\s+shop\/02/);
    expect(text).toMatch(/Blocked:\n\s+shop\/04/);
    expect(text).toMatch(/Claimed:\n\s+shop\/03/);
    expect(text).toContain("Decisions so far:\n  - Pick a database: Postgres.");
    expect(text).toContain("Fog:\n  - Payments");
    expect(text).toContain("Out of scope:\n  - Mobile app");
  });
});

describe("dryland map index on a store", () => {
  it("is refused with the reason: Decisions so far is derived from resolved tickets", async () => {
    const repo = await TempRepo.createStore([SHOP]);

    const result = await repo.run(["map", "index", "shop", "--title", "T", "--link", "issues/01.md", "--gist", "G"]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("derived");
    expect(result.stderr).toContain("dryland ticket resolve");
  });
});

describe("dryland init", () => {
  it("makes a fresh repo ready for the first map and ticket", async () => {
    const repo = TempRepo.create();
    expect((await repo.run(["init"])).exitCode).toBe(0);

    const map = await repo.runWithInput(
      ["map", "create"],
      JSON.stringify({ effort: "shop", title: "Shop", destination: "Sell things." }),
    );
    const ticket = await repo.runWithInput(
      ["ticket", "create"],
      JSON.stringify({ effort: "shop", title: "Pick a database", type: "grilling" }),
    );

    expect(map.stdout).toBe("Created the map of shop: Shop\n");
    expect(ticket.stdout).toBe("Created shop/01: Pick a database\n");
  });
});
