import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TempRepo } from "./harness.ts";

const REF = "refs/dryland/state";

async function initialised(): Promise<TempRepo> {
  const repo = TempRepo.create();
  expect((await repo.run(["init"])).exitCode).toBe(0);
  return repo;
}

describe("the state store", () => {
  it("creates a ticket as an immutable event on a ref that is never checked out", async () => {
    const repo = await initialised();
    const created = await repo.run(["ticket", "create", "--map", "shop", "--title", "Pick a cart", "--type", "task"]);
    expect(created.exitCode).toBe(0);
    expect(created.stdout).toBe("Created shop/01: Pick a cart\n");

    expect(repo.git("rev-parse", "--verify", REF)).not.toBe("");
    const events = repo.git("ls-tree", "-r", "--name-only", REF).split("\n");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatch(/^events\/00000001-.+\.json$/);
    // Nothing reaches the working tree or the current branch.
    expect(repo.git("status", "--porcelain")).toBe("");
    expect(repo.git("branch", "--list")).not.toContain("dryland");
    expect(existsSync(join(repo.path, ".scratch"))).toBe(false);
    expect(readdirSync(repo.path).filter((f) => f !== ".git")).toEqual([".gitkeep"]);
  });

  it("shows and lists the ticket from the replayed state", async () => {
    const repo = await initialised();
    await repo.run(["ticket", "create", "--map", "shop", "--title", "Pick a cart", "--type", "task"]);
    await repo.run([
      "ticket",
      "create",
      "--map",
      "shop",
      "--title",
      "Wire checkout",
      "--type",
      "research",
      "--question",
      "Which provider?",
      "--blocked-by",
      "1",
    ]);

    const show = await repo.run(["ticket", "show", "shop/02", "--json"]);
    expect(show.exitCode).toBe(0);
    expect(JSON.parse(show.stdout)).toMatchObject({
      id: "02",
      map: "shop",
      title: "Wire checkout",
      type: "research",
      state: "open",
      blockers: ["01"],
      body: "Which provider?",
    });
    const list = await repo.run(["ticket", "list"]);
    expect(list.stdout).toContain("shop/01  open  task      Pick a cart");
    expect(list.stdout).toContain("shop/02  open  research  Wire checkout");
  });

  it("rebuilds identical state when the cache is deleted", async () => {
    const repo = await initialised();
    await repo.run(["ticket", "create", "--map", "shop", "--title", "Pick a cart", "--type", "task"]);
    await repo.run(["ticket", "create", "--map", "shop", "--title", "Wire checkout", "--type", "grilling"]);
    const before = (await repo.run(["ticket", "list", "--json"])).stdout;
    const cache = join(repo.path, ".git", "dryland", "cache.sqlite");
    expect(existsSync(cache)).toBe(true);

    rmSync(join(repo.path, ".git", "dryland"), { recursive: true });
    expect((await repo.run(["ticket", "list", "--json"])).stdout).toBe(before);
    expect(existsSync(cache)).toBe(true);
  });

  it("gives parallel creates distinct numbers", async () => {
    const repo = await initialised();
    const runs = await Promise.all(
      ["a", "b", "c", "d"].map((t) => repo.run(["ticket", "create", "--map", "shop", "--title", t, "--type", "task"])),
    );
    expect(runs.map((r) => r.exitCode)).toEqual([0, 0, 0, 0]);
    const ids = JSON.parse((await repo.run(["ticket", "list", "--json"])).stdout).map((t: { id: string }) => t.id);
    expect(ids).toEqual(["01", "02", "03", "04"]);
  });

  it("is shared by a linked worktree", async () => {
    const repo = await initialised();
    await repo.run(["ticket", "create", "--map", "shop", "--title", "Pick a cart", "--type", "task"]);
    const worktree = repo.addWorktree("feature");
    expect((await repo.run(["ticket", "list"], worktree)).stdout).toContain("shop/01");
  });

  it("rejects a blocker that does not exist and an unknown triage role", async () => {
    const repo = await initialised();
    const blocker = await repo.run([
      "ticket",
      "create",
      "--map",
      "shop",
      "--title",
      "x",
      "--type",
      "task",
      "--blocked-by",
      "7",
    ]);
    expect(blocker.exitCode).toBe(1);
    expect(blocker.stderr).toContain("Blocker shop/07 does not exist");
    const role = await repo.run([
      "ticket",
      "create",
      "--map",
      "shop",
      "--title",
      "x",
      "--type",
      "task",
      "--status",
      "soon",
    ]);
    expect(role.exitCode).toBe(1);
    expect(role.stderr).toContain('"soon" is not a triage role');
    expect((await repo.run(["ticket", "list"])).stdout).toBe("No tickets.\n");
  });

  it("init is idempotent", async () => {
    const repo = await initialised();
    const again = await repo.run(["init"]);
    expect(again.stdout).toBe("The Dryland state store already exists.\n");
  });
});
