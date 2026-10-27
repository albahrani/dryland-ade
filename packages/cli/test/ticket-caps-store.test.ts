import { describe, expect, it } from "vitest";
import { CAPS } from "@dryland/core";
import { TempRepo } from "./harness.ts";

// Caps, lint and the session gates on resolve, run through the real command.

const shopRepo = () =>
  TempRepo.createStore([
    {
      effort: "shop",
      map: { title: "Shop" },
      tickets: [
        { title: "Build the cart" },
        { title: "Take payments" },
        { title: "Compare libraries", type: "research" },
        { title: "Pick a logo", type: "research" },
      ],
    },
  ]);

const create = (repo: TempRepo, doc: object) => repo.runWithInput(["ticket", "create"], JSON.stringify(doc));

async function status(repo: TempRepo, ref: string) {
  const result = await repo.run(["ticket", "show", ref, "--json"]);
  return (JSON.parse(result.stdout) as { status: string }).status;
}

describe("caps on ticket create", () => {
  it("rejects an over-cap title with the cap stated, and writes nothing", async () => {
    const repo = await shopRepo();
    const result = await create(repo, { effort: "shop", title: "x".repeat(CAPS.title + 1), type: "task" });

    expect(result.exitCode).toBe(4);
    expect(result.stderr).toContain(`title: over-cap: ${CAPS.title + 1} characters; the title cap is ${CAPS.title}.`);
    expect((await repo.run(["ticket", "list", "--json"])).stdout).not.toContain("xxxxxxxx");
  });

  it("rejects an over-cap Report", async () => {
    const repo = await shopRepo();
    const result = await create(repo, { effort: "shop", title: "Ok", type: "task", report: "a. ".repeat(500) });

    expect(result.exitCode).toBe(4);
    expect(result.stderr).toContain(`the report cap is ${CAPS.report}`);
  });

  it("accepts a title exactly at the cap", async () => {
    const repo = await shopRepo();
    const result = await create(repo, { effort: "shop", title: "x".repeat(CAPS.title), type: "task" });

    expect(result.exitCode, result.stderr).toBe(0);
  });
});

describe("lint", () => {
  const cases: [string, string, string][] = [
    ["hedge", "Maybe pick the first library", "lint-hedge"],
    ["filler", "Simply pick a library", "lint-filler"],
    ["long sentence", `Pick ${"a very long ".repeat(0)}${"word ".repeat(31)}library`, "lint-long-sentence"],
    ["path", "Edit packages/core/src/state-store.ts", "lint-path"],
    ["line number", "Fix the bug on line 42", "lint-line-number"],
    ["bare id", "Follows #12", "lint-bare-id"],
  ];
  for (const [name, title, rule] of cases) {
    it(`rejects a ${name} with the rule stated`, async () => {
      const repo = await shopRepo();
      const result = await repo.runWithInput(
        ["ticket", "create"],
        JSON.stringify({ effort: "shop", title: title.slice(0, 60), type: "task", report: title }),
      );

      expect(result.exitCode).toBe(4);
      expect(result.stderr).toContain(rule);
    });
  }

  it("accepts a plain summary with a ticket reference", async () => {
    const repo = await shopRepo();
    const result = await repo.run(["ticket", "resolve", "shop/01", "--answer", "Server side, as decided in shop/02."]);

    expect(result.exitCode, result.stderr).toBe(0);
  });

  it("rejects a linted summary on resolve and leaves the ticket open", async () => {
    const repo = await shopRepo();
    const result = await repo.run(["ticket", "resolve", "shop/01", "--answer", "Perhaps use Postgres."]);

    expect(result.exitCode).toBe(4);
    expect(result.stderr).toContain("answer: lint-hedge");
    expect(await status(repo, "shop/01")).toBe("open");
  });
});

describe("caps on the solution summary", () => {
  it("rejects an over-cap summary on resolve and on amend, never truncating", async () => {
    const repo = await shopRepo();
    const long = "Postgres. ".repeat(80);

    const resolve = await repo.run(["ticket", "resolve", "shop/01", "--answer", long]);
    expect(resolve.exitCode).toBe(4);
    expect(resolve.stderr).toContain(`the summary cap is ${CAPS.summary}`);
    expect(await status(repo, "shop/01")).toBe("open");

    await repo.run(["ticket", "resolve", "shop/01", "--answer", "Done."]);
    const amend = await repo.run(["ticket", "resolve", "shop/01", "--answer", long, "--amend"]);
    expect(amend.exitCode).toBe(4);
    const shown = JSON.parse((await repo.run(["ticket", "show", "shop/01", "--json"])).stdout) as { answer: string };
    expect(shown.answer).toBe("Done.");
  });
});

describe("resolve gates for a session", () => {
  const as = (session: string) => ({ DRYLAND_SESSION_ID: session });

  it("needs the caller's claim", async () => {
    const repo = await shopRepo();

    const unclaimed = await repo.run(["ticket", "resolve", "shop/01", "--answer", "Done."], repo.path, as("s1"));
    expect(unclaimed.exitCode).toBe(1);
    expect(unclaimed.stderr).toContain("is not claimed");

    const worktree = repo.addWorktree("other-branch");
    await repo.run(["ticket", "claim", "shop/01"], worktree, as("s2"));
    const foreign = await repo.run(["ticket", "resolve", "shop/01", "--answer", "Done."], repo.path, as("s1"));
    expect(foreign.exitCode).toBe(1);
    expect(foreign.stderr).toContain("claimed by other-branch");
    expect(await status(repo, "shop/01")).toBe("claimed");
  });

  it("resolves a claimed ticket once per session, and lets a person or another session resolve more", async () => {
    const repo = await shopRepo();
    await repo.run(["ticket", "claim", "shop/01"], repo.path, as("s1"));
    await repo.run(["ticket", "claim", "shop/02"], repo.path, as("s1"));

    const first = await repo.run(["ticket", "resolve", "shop/01", "--answer", "Done."], repo.path, as("s1"));
    expect(first.exitCode, first.stderr).toBe(0);

    const second = await repo.run(["ticket", "resolve", "shop/02", "--answer", "Done."], repo.path, as("s1"));
    expect(second.exitCode).toBe(1);
    expect(second.stderr).toContain("already resolved shop/01");
    expect(await status(repo, "shop/02")).toBe("claimed");

    const other = await repo.run(["ticket", "resolve", "shop/02", "--answer", "Done."], repo.path, as("s2"));
    expect(other.exitCode, other.stderr).toBe(0);
  });

  it("does not count research, before or after", async () => {
    const repo = await shopRepo();
    for (const ref of ["shop/01", "shop/03", "shop/04"]) await repo.run(["ticket", "claim", ref], repo.path, as("s1"));

    expect((await repo.run(["ticket", "resolve", "shop/03", "--answer", "A."], repo.path, as("s1"))).exitCode).toBe(0);
    expect((await repo.run(["ticket", "resolve", "shop/01", "--answer", "B."], repo.path, as("s1"))).exitCode).toBe(0);
    expect((await repo.run(["ticket", "resolve", "shop/04", "--answer", "C."], repo.path, as("s1"))).exitCode).toBe(0);
  });
});
