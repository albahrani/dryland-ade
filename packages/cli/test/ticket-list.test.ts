import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { createBareRepo, runDryland, TempRepo } from "./harness.ts";

const LOCAL_TRACKER_DOC = "# Issue tracker: Local Markdown\n\nIssues live in `.scratch/`.\n";

const ticket = (title: string, ...lines: string[]) => [`# ${title}`, "", ...lines, ""].join("\n");

describe("dryland ticket list", () => {
  it("prints id, title, type and state of each local-markdown ticket", async () => {
    const repo = TempRepo.create({
      "docs/agents/issue-tracker.md": LOCAL_TRACKER_DOC,
      ".scratch/shop/issues/01-cart.md": ticket("Build the cart", "Type: task", "Status: resolved"),
      ".scratch/shop/issues/02-checkout.md": ticket("Build checkout", "Type: grilling", "Status: claimed"),
      ".scratch/shop/issues/10-refunds.md": ticket("Refunds", "Type: research", "Status: ready-for-agent"),
    });

    const result = await repo.run(["ticket", "list"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(
      [
        "shop/01  resolved  task      Build the cart",
        "shop/02  claimed   grilling  Build checkout",
        "shop/10  open      research  Refunds",
        "",
      ].join("\n"),
    );
  });

  it("returns the same tickets as structured data with --json", async () => {
    const repo = TempRepo.create({
      "docs/agents/issue-tracker.md": LOCAL_TRACKER_DOC,
      ".scratch/shop/issues/01-cart.md": ticket("Build the cart", "Type: task", "Status: resolved"),
      ".scratch/shop/issues/02-notes.md": ticket("Loose notes", "Status: needs-triage"),
    });

    const result = await repo.run(["ticket", "list", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([
      { id: "01", map: "shop", title: "Build the cart", type: "task", state: "resolved" },
      { id: "02", map: "shop", title: "Loose notes", type: "none", state: "open" },
    ]);
  });

  it("lists the main checkout's tickets when run from a linked worktree", async () => {
    const repo = TempRepo.create({
      "docs/agents/issue-tracker.md": LOCAL_TRACKER_DOC,
      ".scratch/shop/issues/01-cart.md": ticket("Build the cart", "Type: task", "Status: claimed"),
    });
    const worktree = repo.addWorktree("shop/01-cart");
    // The worktree's own copy has drifted; only the main checkout counts.
    const staleCopy = join(worktree, ".scratch/shop/issues/01-cart.md");
    mkdirSync(dirname(staleCopy), { recursive: true });
    writeFileSync(staleCopy, ticket("Build the cart", "Type: task", "Status: resolved"));

    const result = await repo.run(["ticket", "list", "--json"], worktree);

    expect(JSON.parse(result.stdout)).toEqual([
      { id: "01", map: "shop", title: "Build the cart", type: "task", state: "claimed" },
    ]);
  });

  it("exits non-zero and names the next action when the tracker doc is missing", async () => {
    const repo = TempRepo.create({
      ".scratch/shop/issues/01-cart.md": ticket("Build the cart", "Type: task"),
    });

    const result = await repo.run(["ticket", "list"]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("docs/agents/issue-tracker.md");
    expect(result.stderr).toContain("/setup-matt-pocock-skills");
  });

  it("exits non-zero and names the next action for an unsupported tracker", async () => {
    const repo = TempRepo.create({
      "docs/agents/issue-tracker.md": "# Issue tracker: Jira\n\nUse the Jira board.\n",
    });

    const result = await repo.run(["ticket", "list"]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Jira");
    expect(result.stderr).toMatch(/local-markdown/i);
  });

  it("says there are no tickets for an empty tracker and returns an empty list for --json", async () => {
    const repo = TempRepo.create({ "docs/agents/issue-tracker.md": LOCAL_TRACKER_DOC });

    const plain = await repo.run(["ticket", "list"]);
    const json = await repo.run(["ticket", "list", "--json"]);

    expect(plain.exitCode).toBe(0);
    expect(plain.stdout).toBe("No tickets.\n");
    expect(JSON.parse(json.stdout)).toEqual([]);
  });

  it("finds the main checkout when its git directory lives elsewhere", async () => {
    const repo = TempRepo.create(
      {
        "docs/agents/issue-tracker.md": LOCAL_TRACKER_DOC,
        ".scratch/shop/issues/01-cart.md": ticket("Build the cart", "Type: task", "Status: claimed"),
      },
      { separateGitDir: true },
    );

    const result = await repo.run(["ticket", "list", "--json"]);

    expect(JSON.parse(result.stdout)).toEqual([
      { id: "01", map: "shop", title: "Build the cart", type: "task", state: "claimed" },
    ]);
  });

  it("exits non-zero and names the next action in a bare repository", async () => {
    const result = await runDryland(["ticket", "list"], { cwd: createBareRepo() });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("no working tree");
    expect(result.stderr).toContain("Next:");
  });

  it("exits non-zero outside a git repository", async () => {
    const dir = mkdtempSync(join(tmpdir(), "dryland-nogit-"));

    const result = await runDryland(["ticket", "list"], { cwd: dir });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("git repository");
  });
});

describe("dryland ticket list on real skill tickets", () => {
  it("parses tickets copied from this repo's own .scratch directory", async () => {
    const fixtures = join(import.meta.dirname, "fixtures/real-scratch");
    const issues = join(fixtures, "mattpocock-ade/issues");
    const files: Record<string, string> = { "docs/agents/issue-tracker.md": LOCAL_TRACKER_DOC };
    for (const name of readdirSync(issues)) {
      files[`.scratch/mattpocock-ade/issues/${name}`] = readFileSync(join(issues, name), "utf8");
    }
    const repo = TempRepo.create(files);

    const result = await repo.run(["ticket", "list", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([
      { id: "01", map: "mattpocock-ade", title: "How Orca works", type: "research", state: "resolved" },
      { id: "11", map: "mattpocock-ade", title: "Views and UX", type: "prototype", state: "resolved" },
      {
        id: "13",
        map: "mattpocock-ade",
        title: "ADE write policy and non-default skill setups",
        type: "grilling",
        state: "resolved",
      },
      {
        id: "20",
        map: "mattpocock-ade",
        title: "Workspace and `dryland ticket list`",
        type: "task",
        state: "open",
      },
      { id: "22", map: "mattpocock-ade", title: "Maps and the full ticket model", type: "task", state: "open" },
    ]);
  });
});
