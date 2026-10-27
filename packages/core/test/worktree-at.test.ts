import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createWorktree, nodeProcessRunner, worktreeAt } from "../src/index.ts";
import { SHOP_CART, storeRepo } from "./store-repo.ts";

describe("worktreeAt", () => {
  it("finds the ticket's worktree from its root and from a directory inside it", async () => {
    const repo = await storeRepo(SHOP_CART);
    const created = await createWorktree(nodeProcessRunner, repo, { ticket: "shop/01" });
    mkdirSync(join(created.path, "src/deep"), { recursive: true });

    for (const cwd of [created.path, join(created.path, "src/deep")]) {
      const found = await worktreeAt(nodeProcessRunner, repo, cwd);
      expect(found).toMatchObject({
        branch: created.branch,
        path: created.path,
        link: { kind: "name", ticket: "shop/01" },
      });
    }
  });

  it("finds a scratch worktree, which links to no ticket", async () => {
    const repo = await storeRepo(SHOP_CART);
    const created = await createWorktree(nodeProcessRunner, repo, { map: "shop", slug: "poke" });

    const found = await worktreeAt(nodeProcessRunner, repo, created.path);

    expect(found?.link).toEqual({ kind: "scratch", ticket: null });
  });

  it("finds the main checkout as unlinked, and nothing for a directory outside every worktree", async () => {
    const repo = await storeRepo(SHOP_CART);
    await createWorktree(nodeProcessRunner, repo, { ticket: "shop/01" });

    expect(await worktreeAt(nodeProcessRunner, repo, repo)).toMatchObject({ main: true, link: { kind: "unlinked" } });
    expect(await worktreeAt(nodeProcessRunner, repo, tmpdir())).toBeNull();
  });
});
