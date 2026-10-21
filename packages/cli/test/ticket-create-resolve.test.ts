import { describe, expect, it } from "vitest";
import { TempRepo } from "./harness.ts";

const LOCAL_TRACKER_DOC = "# Issue tracker: Local Markdown\n\nIssues live in `.scratch/`.\n";
const MAP = "# Map: Shop\n\n## Destination\n\nA shop.\n\n## Decisions so far\n\nNothing.\n";
const TICKET_PATH = ".scratch/shop/issues/01-cart.md";
const TICKET = "# Build the cart\n\nType: task\nStatus: ready-for-agent\n\n## Question\n\nCarts live on the server.\n";

function shopRepo(files: Record<string, string> = {}): TempRepo {
  return TempRepo.create({
    "docs/agents/issue-tracker.md": LOCAL_TRACKER_DOC,
    ".scratch/shop/map.md": MAP,
    [TICKET_PATH]: TICKET,
    ...files,
  });
}

const create = (repo: TempRepo, ...extra: string[]) =>
  repo.run(["ticket", "create", "--map", "shop", "--title", "Pick a payment provider", "--type", "research", ...extra]);

describe("dryland ticket create", () => {
  it("writes the next numbered ticket that ticket show reads back, and commits only it", async () => {
    const repo = shopRepo();
    repo.write("unrelated.txt", "dirty");

    const result = await create(repo, "--question", "Which provider fits?", "--blocked-by", "01");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("shop/02");
    const shown = JSON.parse((await repo.run(["ticket", "show", "shop/02", "--json"])).stdout);
    expect(shown).toMatchObject({
      id: "02",
      map: "shop",
      title: "Pick a payment provider",
      type: "research",
      state: "open",
      blockers: ["01"],
    });
    expect(shown.body).toContain("## Question\n\nWhich provider fits?");
    expect(repo.read(".scratch/shop/issues/02-pick-a-payment-provider.md")).toMatch(/^# Pick a payment provider\n/);
    expect(repo.log()[0]).toBe("Create ticket shop/02: Pick a payment provider");
    expect(repo.git("status", "--porcelain")).toBe("?? unrelated.txt");
  });

  it("numbers N parallel creates consecutively without collisions", async () => {
    const repo = shopRepo();

    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        repo.run(["ticket", "create", "--map", "shop", "--title", `Ticket ${i}`, "--type", "task"]),
      ),
    );

    // Each failure carries its own stderr, so a rare failure under load says why.
    for (const [i, result] of results.entries()) expect(result.exitCode, `create ${i}: ${result.stderr}`).toBe(0);
    const listed = JSON.parse((await repo.run(["ticket", "list", "--json"])).stdout) as { id: string }[];
    expect(
      listed.map((t) => t.id),
      `git log: ${repo.log().join(" | ")}`,
    ).toEqual(["01", "02", "03", "04", "05", "06", "07"]);
  });

  it("fails for an unknown map and states the next action", async () => {
    const repo = shopRepo();

    const result = await repo.run(["ticket", "create", "--map", "nope", "--title", "X", "--type", "task"]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("nope");
    expect(result.stderr).toContain("Next:");
  });

  it("rejects an unknown type before writing anything", async () => {
    const repo = shopRepo();

    const result = await repo.run(["ticket", "create", "--map", "shop", "--title", "X", "--type", "bogus"]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("Next:");
    expect(repo.git("status", "--porcelain")).toBe("");
  });
});

describe("dryland ticket resolve", () => {
  it("records the answer and resolved state, commits it, and unblocks dependants", async () => {
    const repo = shopRepo({
      ".scratch/shop/issues/02-pay.md":
        "# Pay\n\nType: task\nStatus: ready-for-agent\nBlocked by: 01\n\n## Question\n\nPay.\n",
    });
    expect((await repo.run(["map", "frontier", "shop", "--json"])).stdout).not.toContain('"02"');

    const result = await repo.run(["ticket", "resolve", "shop/01", "--answer", "Server side, in Postgres."]);

    expect(result.exitCode).toBe(0);
    const shown = JSON.parse((await repo.run(["ticket", "show", "shop/01", "--json"])).stdout);
    expect(shown).toMatchObject({ state: "resolved", answer: "Server side, in Postgres." });
    expect(shown.body).toContain("Carts live on the server.");
    const frontier = JSON.parse((await repo.run(["map", "frontier", "shop", "--json"])).stdout) as { id: string }[];
    expect(frontier.map((t) => t.id)).toEqual(["02"]);
    expect(repo.log()[0]).toBe("Resolve shop/01");
    expect(repo.git("status", "--porcelain")).toBe("");
  });

  it("fills an empty Answer heading instead of adding a second one, and commits only the ticket", async () => {
    const repo = shopRepo({ [TICKET_PATH]: `${TICKET}\n## Answer\n\n` });
    repo.write("unrelated.txt", "dirty");

    const result = await repo.run(["ticket", "resolve", "shop/01", "--answer", "Server side."]);

    expect(result.exitCode).toBe(0);
    expect(repo.read(TICKET_PATH).match(/^## Answer/gm)).toHaveLength(1);
    const shown = JSON.parse((await repo.run(["ticket", "show", "shop/01", "--json"])).stdout);
    expect(shown.answer).toBe("Server side.");
    expect(repo.git("status", "--porcelain")).toBe("?? unrelated.txt");
  });

  it("also releases a claim, leaving no dryland annotation behind", async () => {
    const repo = shopRepo();
    await repo.run(["ticket", "claim", "shop/01"]);

    const result = await repo.run(["ticket", "resolve", "shop/01", "--answer", "Done."]);

    expect(result.exitCode).toBe(0);
    expect(repo.read(TICKET_PATH)).not.toContain("dryland:");
    const shown = JSON.parse((await repo.run(["ticket", "show", "shop/01", "--json"])).stdout);
    expect(shown).toMatchObject({ state: "resolved", claimant: null });
  });

  it("run from a worktree leaves that worktree and its branch in place", async () => {
    const repo = shopRepo();
    const worktree = repo.addWorktree("ticket-01");

    const result = await repo.run(["ticket", "resolve", "shop/01", "--answer", "Done."], worktree);

    expect(result.exitCode).toBe(0);
    expect(repo.git("worktree", "list")).toContain("ticket-01");
    expect(repo.git("branch", "--list", "ticket-01")).toContain("ticket-01");
    expect(repo.read(TICKET_PATH)).toContain("Status: resolved");
  });

  it("fails on an unknown or already resolved ticket and states the next action", async () => {
    const repo = shopRepo();
    await repo.run(["ticket", "resolve", "shop/01", "--answer", "Done."]);

    const again = await repo.run(["ticket", "resolve", "shop/01", "--answer", "Again."]);
    const unknown = await repo.run(["ticket", "resolve", "shop/09", "--answer", "?"]);

    for (const result of [again, unknown]) {
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("Next:");
    }
    expect(again.stderr).toContain("already resolved");
  });
});

const CRITERIA =
  "\n### Acceptance criteria\n\n- [ ] First\n- [x] Second\n- [ ] Third\n\n## Notes\n\n- [ ] Not a criterion\n";

describe("dryland ticket tick", () => {
  it("ticks the nth criterion, touching only that box, and commits only the ticket", async () => {
    const repo = shopRepo({ [TICKET_PATH]: TICKET + CRITERIA });
    repo.write("unrelated.txt", "dirty");

    const result = await repo.run(["ticket", "tick", "shop/01", "--criterion", "3"]);

    expect(result.exitCode, result.stderr).toBe(0);
    expect(repo.read(TICKET_PATH)).toBe(TICKET + CRITERIA.replace("- [ ] Third", "- [x] Third"));
    expect(repo.log()[0]).toBe("Tick criterion 3 of shop/01");
    expect(repo.git("status", "--porcelain")).toBe("?? unrelated.txt");
  });

  it("fails clearly for a bad number, a ticked box or a ticket without criteria", async () => {
    const repo = shopRepo({ [TICKET_PATH]: TICKET + CRITERIA, ".scratch/shop/issues/02-bare.md": TICKET });

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
    expect(repo.read(TICKET_PATH)).toBe(TICKET + CRITERIA);
  });

  it("ticks N different criteria in parallel without losing any", async () => {
    const boxes = Array.from({ length: 6 }, (_, i) => `- [ ] Box ${i + 1}`).join("\n");
    const repo = shopRepo({ [TICKET_PATH]: `${TICKET}\n## Acceptance criteria\n\n${boxes}\n` });

    const results = await Promise.all(
      [1, 2, 3, 4, 5, 6].map((n) => repo.run(["ticket", "tick", "shop/01", "--criterion", String(n)])),
    );

    for (const [i, result] of results.entries()) expect(result.exitCode, `tick ${i + 1}: ${result.stderr}`).toBe(0);
    expect(repo.read(TICKET_PATH)).not.toContain("[ ]");
    expect(repo.git("status", "--porcelain")).toBe("");
  });
});

describe("dryland ticket resolve --amend", () => {
  it("replaces the answer of a resolved ticket and keeps the other sections", async () => {
    const resolved = TICKET.replace("ready-for-agent", "resolved");
    const repo = shopRepo({ [TICKET_PATH]: `${resolved}\n## Answer\n\nWrong.\n\n## Comments\n\nA note.\n` });

    const result = await repo.run(["ticket", "resolve", "shop/01", "--answer", "Right.\nTwo lines.", "--amend"]);

    expect(result.exitCode, result.stderr).toBe(0);
    expect(repo.read(TICKET_PATH)).toContain("## Answer\n\nRight.\nTwo lines.\n\n## Comments\n\nA note.\n");
    expect(repo.read(TICKET_PATH).match(/^## Answer/gm)).toHaveLength(1);
    expect(repo.log()[0]).toBe("Amend answer of shop/01");
    const shown = JSON.parse((await repo.run(["ticket", "show", "shop/01", "--json"])).stdout);
    expect(shown).toMatchObject({ state: "resolved", answer: "Right.\nTwo lines." });
  });

  it("still refuses to resolve a resolved ticket without --amend, and to amend an open one", async () => {
    const repo = shopRepo();
    const open = await repo.run(["ticket", "resolve", "shop/01", "--answer", "x", "--amend"]);
    await repo.run(["ticket", "resolve", "shop/01", "--answer", "Done."]);
    const again = await repo.run(["ticket", "resolve", "shop/01", "--answer", "Again."]);

    expect(open.exitCode).not.toBe(0);
    expect(open.stderr).toContain("not resolved");
    expect(again.exitCode).not.toBe(0);
    expect(again.stderr).toContain("already resolved");
    expect(repo.read(TICKET_PATH)).toContain("Done.");
  });
});

describe("dryland option checking", () => {
  it("refuses an option the command does not take instead of ignoring it", async () => {
    const repo = shopRepo();

    const result = await repo.run(["ticket", "claim", "shop/01", "--answer", "oops"]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("--answer");
    expect(result.stderr).toContain("Next:");
    expect(repo.read(TICKET_PATH)).toBe(TICKET);
  });
});
