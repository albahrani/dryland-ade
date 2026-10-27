import { describe, expect, it } from "vitest";
import { TempRepo } from "./harness.ts";

// The store twins of ticket-claim, ticket-create-resolve and ticket-block-comment-triage: the same behaviour on a repo
// whose tickets live in the state store. The markdown originals stay green until ticket 45 deletes them.

const shopRepo = (
  extra: { title: string; blockedBy?: number[]; criteria?: { text: string; done?: boolean }[] }[] = [],
) =>
  TempRepo.createStore([
    {
      effort: "shop",
      map: { title: "Shop" },
      tickets: [{ title: "Build the cart", report: "Carts live on the server." }, ...extra],
    },
  ]);

async function show(repo: TempRepo, ref: string, cwd?: string) {
  const result = await repo.run(["ticket", "show", ref, "--json"], cwd);
  expect(result.exitCode, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as {
    status: string;
    claim: { holder: string; at: string; session: string | null } | null;
    answer: string | null;
    comments: string[];
    blockedBy: string[];
    triageRole: string | null;
    criteria: { text: string; done: boolean }[];
  };
}

async function frontier(repo: TempRepo): Promise<string[]> {
  const doc = JSON.parse((await repo.run(["map", "frontier", "shop", "--json"])).stdout) as {
    tickets: { id: string }[];
  };
  return doc.tickets.map((t) => t.id);
}

describe("dryland ticket claim on the store", () => {
  it("claims for the branch of its working directory and leaves the repo untouched", async () => {
    const repo = await shopRepo();
    const head = repo.git("rev-parse", "HEAD");

    const result = await repo.run(["ticket", "claim", "shop/01"]);

    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toBe("Claimed shop/01 for main.\n");
    expect(await show(repo, "shop/01")).toMatchObject({ status: "claimed", claim: { holder: "main" } });
    expect(repo.git("status", "--porcelain")).toBe("");
    expect(repo.git("rev-parse", "HEAD")).toBe(head);
  });

  it("claims for the worktree's branch and records the session that made it", async () => {
    const repo = await shopRepo();
    const worktree = repo.addWorktree("shop/01-cart");

    const result = await repo.run(["ticket", "claim", "shop/01"], worktree, { DRYLAND_SESSION_ID: "session-a" });

    expect(result.exitCode, result.stderr).toBe(0);
    expect((await show(repo, "shop/01")).claim).toMatchObject({ holder: "shop/01-cart", session: "session-a" });
  });

  it("succeeds without a change when the branch already holds the claim, and fails for another holder", async () => {
    const repo = await shopRepo();
    const worktree = repo.addWorktree("shop/01-cart");
    await repo.run(["ticket", "claim", "shop/01"], worktree, { DRYLAND_SESSION_ID: "session-a" });
    const first = await show(repo, "shop/01");

    const again = await repo.run(["ticket", "claim", "shop/01"], worktree, { DRYLAND_SESSION_ID: "session-b" });
    const other = await repo.run(["ticket", "claim", "shop/01"], repo.path);

    expect(again.exitCode).toBe(0);
    expect(again.stdout).toBe("shop/01-cart already holds shop/01.\n");
    expect(other.exitCode).not.toBe(0);
    expect(other.stderr).toContain("already claimed by shop/01-cart");
    expect(other.stderr).toContain("Next:");
    expect(await show(repo, "shop/01")).toEqual(first);
  });

  it("lets exactly one of several parallel claims win and tells the losers who holds it", async () => {
    const repo = await shopRepo();
    const holders = Array.from({ length: 8 }, (_, i) => `shop/01-cart-${i}`);
    const worktrees = holders.map((branch) => repo.addWorktree(branch));

    const results = await Promise.all(worktrees.map((worktree) => repo.run(["ticket", "claim", "shop/01"], worktree)));

    const winners = holders.filter((_, i) => results[i]?.exitCode === 0);
    expect(winners).toHaveLength(1);
    for (const result of results.filter((r) => r.exitCode !== 0)) {
      expect(result.stderr).toContain(`already claimed by ${winners[0]}`);
    }
    expect((await show(repo, "shop/01")).claim?.holder).toBe(winners[0]);
  });

  it("refuses a resolved ticket and accepts --commit and --no-commit, which the store has no use for", async () => {
    const repo = await shopRepo();
    expect((await repo.run(["ticket", "claim", "shop/01", "--no-commit"])).exitCode).toBe(0);
    expect((await repo.run(["ticket", "release", "shop/01", "--commit"])).exitCode).toBe(0);
    await repo.run(["ticket", "resolve", "shop/01", "--answer", "Done."]);

    const result = await repo.run(["ticket", "claim", "shop/01"]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("already resolved");
  });
});

describe("dryland ticket release on the store", () => {
  it("opens a claimed ticket again", async () => {
    const repo = await shopRepo();
    await repo.run(["ticket", "claim", "shop/01"]);

    const result = await repo.run(["ticket", "release", "shop/01"]);

    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toBe("Released shop/01.\n");
    expect(await show(repo, "shop/01")).toMatchObject({ status: "open", claim: null });
    expect(await frontier(repo)).toEqual(["01"]);
  });

  it("fails clearly on a ticket that is not claimed", async () => {
    const repo = await shopRepo();

    const result = await repo.run(["ticket", "release", "shop/01"]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("not claimed");
    expect(result.stderr).toContain("Next:");
  });
});

describe("dryland ticket resolve on the store", () => {
  it("records the answer and unblocks dependants", async () => {
    const repo = await shopRepo([{ title: "Pay", blockedBy: [1] }]);
    expect(await frontier(repo)).toEqual(["01"]);

    const result = await repo.run(["ticket", "resolve", "shop/01", "--answer", "Server side, in Postgres."]);

    expect(result.exitCode, result.stderr).toBe(0);
    expect(await show(repo, "shop/01")).toMatchObject({ status: "resolved", answer: "Server side, in Postgres." });
    expect(await frontier(repo)).toEqual(["02"]);
  });

  it("also releases a claim", async () => {
    const repo = await shopRepo();
    await repo.run(["ticket", "claim", "shop/01"]);

    expect((await repo.run(["ticket", "resolve", "shop/01", "--answer", "Done."])).exitCode).toBe(0);

    expect(await show(repo, "shop/01")).toMatchObject({ status: "resolved", claim: null });
  });

  it("run from a worktree leaves that worktree and its branch in place", async () => {
    const repo = await shopRepo();
    const worktree = repo.addWorktree("ticket-01");

    const result = await repo.run(["ticket", "resolve", "shop/01", "--answer", "Done."], worktree);

    expect(result.exitCode, result.stderr).toBe(0);
    expect(repo.git("worktree", "list")).toContain("ticket-01");
    expect(repo.git("branch", "--list", "ticket-01")).toContain("ticket-01");
  });

  it("fails on an unknown, already resolved or answerless ticket and states the next action", async () => {
    const repo = await shopRepo();
    await repo.run(["ticket", "resolve", "shop/01", "--answer", "Done."]);

    const again = await repo.run(["ticket", "resolve", "shop/01", "--answer", "Again."]);
    const unknown = await repo.run(["ticket", "resolve", "shop/09", "--answer", "?"]);
    const blank = await repo.run(["ticket", "resolve", "shop/01", "--answer", "  "]);

    for (const result of [again, unknown, blank]) {
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("Next:");
    }
    expect(again.stderr).toContain("already resolved");
    expect((await show(repo, "shop/01")).answer).toBe("Done.");
  });

  it("amends the answer of a resolved ticket, and refuses to amend an open one", async () => {
    const repo = await shopRepo();
    const open = await repo.run(["ticket", "resolve", "shop/01", "--answer", "x", "--amend"]);
    await repo.run(["ticket", "resolve", "shop/01", "--answer", "Wrong."]);

    const amended = await repo.run(["ticket", "resolve", "shop/01", "--answer", "Right.\nTwo lines.", "--amend"]);

    expect(open.exitCode).not.toBe(0);
    expect(open.stderr).toContain("not resolved");
    expect(amended.exitCode, amended.stderr).toBe(0);
    expect(amended.stdout).toBe("Amended the answer of shop/01.\n");
    expect(await show(repo, "shop/01")).toMatchObject({ status: "resolved", answer: "Right.\nTwo lines." });
  });
});

describe("dryland ticket tick on the store", () => {
  const withCriteria = () =>
    TempRepo.createStore([
      {
        effort: "shop",
        tickets: [
          { title: "Build the cart", criteria: [{ text: "First" }, { text: "Second", done: true }, { text: "Third" }] },
          { title: "Bare" },
        ],
      },
    ]);

  it("ticks the nth criterion, touching only that box", async () => {
    const repo = await withCriteria();

    const result = await repo.run(["ticket", "tick", "shop/01", "--criterion", "3"]);

    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toBe("Ticked criterion 3 of shop/01.\n");
    expect((await show(repo, "shop/01")).criteria.map((c) => c.done)).toEqual([false, true, true]);
  });

  it("fails clearly for a bad number, a ticked box or a ticket without criteria", async () => {
    const repo = await withCriteria();
    const tick = (target: string, n: string) => repo.run(["ticket", "tick", target, "--criterion", n]);

    const outOfRange = await tick("shop/01", "4");
    const zero = await tick("shop/01", "0");
    const word = await tick("shop/01", "two");
    const ticked = await tick("shop/01", "2");
    const none = await tick("shop/02", "1");

    for (const result of [outOfRange, zero, word, ticked, none]) {
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("Next:");
    }
    expect(outOfRange.stderr).toContain("3 acceptance criteria");
    expect(ticked.stderr).toContain("already ticked");
    expect(none.stderr).toContain("no acceptance criteria");
    expect((await show(repo, "shop/01")).criteria.map((c) => c.done)).toEqual([false, true, false]);
  });

  it("ticks N different criteria in parallel without losing any", async () => {
    const repo = await TempRepo.createStore([
      {
        effort: "shop",
        tickets: [{ title: "Boxes", criteria: Array.from({ length: 6 }, (_, i) => ({ text: `Box ${i + 1}` })) }],
      },
    ]);

    const results = await Promise.all(
      [1, 2, 3, 4, 5, 6].map((n) => repo.run(["ticket", "tick", "shop/01", "--criterion", String(n)])),
    );

    for (const [i, result] of results.entries()) expect(result.exitCode, `tick ${i + 1}: ${result.stderr}`).toBe(0);
    expect((await show(repo, "shop/01")).criteria.every((c) => c.done)).toBe(true);
  });
});

describe("dryland ticket create on the store", () => {
  it("numbers the next ticket and refuses an unknown type before writing anything", async () => {
    const repo = await shopRepo();
    const doc = (fields: object) =>
      JSON.stringify({ effort: "shop", title: "Pick a provider", type: "research", ...fields });

    const created = await repo.runWithInput(["ticket", "create"], doc({}));
    const bad = await repo.runWithInput(["ticket", "create"], doc({ type: "bogus" }));

    expect(created.stdout).toBe("Created shop/02: Pick a provider\n");
    expect(bad.exitCode).not.toBe(0);
    expect(bad.stderr).toContain("type");
    const list = JSON.parse((await repo.run(["ticket", "list", "--json"])).stdout) as { tickets: unknown[] };
    expect(list.tickets).toHaveLength(2);
  });
});

describe("dryland ticket block on the store", () => {
  const two = () => shopRepo([{ title: "Pay" }]);

  it("adding a blocker removes the ticket from the frontier and removing it puts it back", async () => {
    const repo = await two();
    expect(await frontier(repo)).toEqual(["01", "02"]);

    const added = await repo.run(["ticket", "block", "shop/02", "--add", "01"]);

    expect(added.exitCode, added.stderr).toBe(0);
    expect(await frontier(repo)).toEqual(["01"]);
    expect((await show(repo, "shop/02")).blockedBy).toEqual(["shop/01"]);

    const removed = await repo.run(["ticket", "block", "shop/02", "--remove", "01"]);

    expect(removed.exitCode, removed.stderr).toBe(0);
    expect(await frontier(repo)).toEqual(["01", "02"]);
    expect((await show(repo, "shop/02")).blockedBy).toEqual([]);
  });

  it("keeps the claim and rejects a missing, self, repeated or absent blocker, changing nothing", async () => {
    const repo = await two();
    await repo.run(["ticket", "claim", "shop/02"]);
    await repo.run(["ticket", "block", "shop/02", "--add", "01"]);
    const before = await show(repo, "shop/02");
    expect(before.claim?.holder).toBe("main");

    const attempts = [
      ["ticket", "block", "shop/02", "--add", "09"],
      ["ticket", "block", "shop/02", "--add", "02"],
      ["ticket", "block", "shop/02", "--add", "01"],
      ["ticket", "block", "shop/01", "--remove", "02"],
      ["ticket", "block", "shop/02"],
    ];
    for (const args of attempts) {
      const result = await repo.run(args);
      expect(result.exitCode, args.join(" ")).not.toBe(0);
      expect(result.stderr, args.join(" ")).toContain("Next:");
    }
    expect(await show(repo, "shop/02")).toEqual(before);
  });

  it("keeps the order of existing blockers when adding one", async () => {
    const repo = await shopRepo([{ title: "Two" }, { title: "Ship", blockedBy: [2, 1] }, { title: "Extra" }]);

    const added = await repo.run(["ticket", "block", "shop/03", "--add", "04"]);

    expect(added.exitCode, added.stderr).toBe(0);
    expect((await show(repo, "shop/03")).blockedBy).toEqual(["shop/02", "shop/01", "shop/04"]);
  });
});

describe("dryland ticket comment on the store", () => {
  it("appends comments in order and shows them", async () => {
    const repo = await shopRepo();

    const first = await repo.run(["ticket", "comment", "shop/01", "--text", "Looks good."]);
    await repo.run(["ticket", "comment", "shop/01", "--text", "Second thought."]);

    expect(first.exitCode, first.stderr).toBe(0);
    expect((await show(repo, "shop/01")).comments).toEqual(["Looks good.", "Second thought."]);
    expect((await repo.run(["ticket", "show", "shop/01", "--text"])).stdout).toContain("Comments (2):");
  });

  it("rejects an empty comment with the next action", async () => {
    const repo = await shopRepo();

    const result = await repo.run(["ticket", "comment", "shop/01", "--text", "  "]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("Next:");
  });
});

describe("dryland ticket triage on the store", () => {
  it("sets the role the ticket reads back with", async () => {
    const repo = await shopRepo();

    const result = await repo.run(["ticket", "triage", "shop/01", "--role", "needs-info"]);

    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toBe("Triaged shop/01 as needs-info.\n");
    expect(await show(repo, "shop/01")).toMatchObject({ status: "open", triageRole: "needs-info" });
  });

  it("resolves the repo's own label for a role from the triage-labels doc", async () => {
    const repo = await TempRepo.createStore(
      [{ effort: "shop", map: { title: "Shop" }, tickets: [{ title: "Build the cart" }] }],
      { "docs/agents/triage-labels.md": "| Role | Label |\n|---|---|\n| `needs-info` | `Need-Info` |\n" },
    );

    const result = await repo.run(["ticket", "triage", "shop/01", "--role", "need-info"]);

    expect(result.exitCode, result.stderr).toBe(0);
    expect(await show(repo, "shop/01")).toMatchObject({ triageRole: "needs-info" });
  });

  it("rejects an unknown role and lists the valid ones, changing nothing", async () => {
    const repo = await shopRepo();

    const result = await repo.run(["ticket", "triage", "shop/01", "--role", "urgent"]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("urgent");
    for (const role of ["needs-triage", "needs-info", "ready-for-agent", "ready-for-human", "wontfix"]) {
      expect(result.stderr).toContain(role);
    }
    expect((await show(repo, "shop/01")).triageRole).toBeNull();
  });

  it("refuses to retriage a claimed or resolved ticket and states the next action", async () => {
    const repo = await shopRepo([{ title: "Pay" }]);
    await repo.run(["ticket", "claim", "shop/01"]);
    await repo.run(["ticket", "resolve", "shop/02", "--answer", "Done."]);

    const claimed = await repo.run(["ticket", "triage", "shop/01", "--role", "needs-info"]);
    const resolved = await repo.run(["ticket", "triage", "shop/02", "--role", "needs-info"]);

    for (const result of [claimed, resolved]) {
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("Next:");
    }
    expect((await show(repo, "shop/01")).triageRole).toBeNull();
  });
});

describe("dryland option checking on the store", () => {
  it("refuses an option the command does not take instead of ignoring it", async () => {
    const repo = await shopRepo();

    const result = await repo.run(["ticket", "claim", "shop/01", "--answer", "oops"]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("--answer");
    expect((await show(repo, "shop/01")).status).toBe("open");
  });
});
