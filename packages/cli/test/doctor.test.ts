import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isolatedPath, stubCli, TempRepo, tempDir } from "./harness.ts";

const DOCS = {
  "docs/agents/issue-tracker.md": "# Issue tracker: Local Markdown\n\nIssues live in `.scratch/`.\n",
  "docs/agents/triage-labels.md": "# Triage labels\n",
  "docs/agents/domain.md": "# Domain Docs\n",
};
const SKILL = { ".agents/skills/tdd/SKILL.md": "---\nname: tdd\n---\n" };

interface Check {
  id: string;
  ok: boolean;
  detail: string;
  nextAction: string | null;
}

/** A directory holding a runnable `dryland`, to put on PATH. */
function dirWithDryland(): string {
  const dir = tempDir("dryland-bin-");
  const name = process.platform === "win32" ? "dryland.cmd" : "dryland";
  writeFileSync(join(dir, name), "@echo off\n");
  chmodSync(join(dir, name), 0o755);
  return dir;
}

const withDrylandOnPath = () => isolatedPath(dirWithDryland());
const withoutDrylandOnPath = () => isolatedPath(tempDir("dryland-empty-"));

function doctor(repo: TempRepo, env: Record<string, string>, ...args: string[]) {
  return repo.run(["doctor", ...args], repo.path, env);
}

async function checks(repo: TempRepo, env: Record<string, string>): Promise<Check[]> {
  const result = await doctor(repo, env, "--json");
  return (JSON.parse(result.stdout) as { checks: Check[] }).checks;
}

describe("dryland doctor", () => {
  it("reports every check as OK and exits 0 in a healthy default repo", async () => {
    const repo = TempRepo.create({ ...DOCS, ...SKILL });

    const result = await doctor(repo, withDrylandOnPath());

    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/OK\s+setup/);
    expect(result.stdout).toMatch(/OK\s+tracker/);
    expect(result.stdout).toMatch(/OK\s+path/);
    expect(result.stdout).not.toMatch(/FAIL/);
  });

  it("names what is missing and the next action, and exits non-zero, when dryland is not on PATH", async () => {
    const repo = TempRepo.create({ ...DOCS, ...SKILL });

    const result = await doctor(repo, withoutDrylandOnPath());

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatch(/FAIL\s+path\s+dryland is not on PATH/);
    expect(result.stdout).toMatch(/Next: .*PATH/);
    expect(result.stdout).toMatch(/OK\s+setup/);
  });

  it("reports a repo without the skills set up, with /setup-matt-pocock-skills as the next action", async () => {
    const repo = TempRepo.create({});

    const result = await doctor(repo, withDrylandOnPath());

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatch(/FAIL\s+setup/);
    expect(result.stdout).toContain("skills");
    expect(result.stdout).toContain("docs/agents/issue-tracker.md");
    expect(result.stdout).toContain("Next: Run /setup-matt-pocock-skills");
  });

  it("returns the checks as structured data with --json, still exiting non-zero on a failure", async () => {
    const repo = TempRepo.create({ ...DOCS });

    const result = await doctor(repo, withDrylandOnPath(), "--json");

    expect(result.exitCode).toBe(1);
    const report = JSON.parse(result.stdout) as {
      ok: boolean;
      checks: Check[];
    };
    expect(report.ok).toBe(false);
    expect(report.checks.map((c) => [c.id, c.ok])).toEqual([
      ["setup", false],
      ["tracker", true],
      ["path", true],
    ]);
    expect(report.checks[0]?.nextAction).toContain("/setup-matt-pocock-skills");
    expect(report.checks[1]?.nextAction).toBeNull();
  });

  it("works from a linked worktree, reading the main checkout's setup", async () => {
    const repo = TempRepo.create({ ...DOCS, ...SKILL });
    const worktree = repo.addWorktree("feature/x");

    const result = await repo.run(["doctor"], worktree, withDrylandOnPath());

    expect(result.exitCode).toBe(0);
  });

  it("reports an unreadable tracker doc as a failing tracker check", async () => {
    const repo = TempRepo.create({
      ...SKILL,
      "docs/agents/issue-tracker.md": "# Issue tracker: Jira\n",
    });

    const list = await checks(repo, withDrylandOnPath());

    expect(list.find((c) => c.id === "tracker")).toMatchObject({ ok: false });
  });

  it("does not count a directory named dryland as the launcher", async () => {
    const repo = TempRepo.create({ ...DOCS, ...SKILL });
    const dir = tempDir("dryland-dirbin-");
    mkdirSync(join(dir, "dryland"));
    mkdirSync(join(dir, "dryland.cmd"));

    const list = await checks(repo, isolatedPath(dir));

    expect(list.find((c) => c.id === "path")).toMatchObject({ ok: false });
  });

  it.skipIf(process.platform === "win32")("does not count a dryland without the executable bit", async () => {
    const repo = TempRepo.create({ ...DOCS, ...SKILL });
    const dir = tempDir("dryland-noexec-");
    writeFileSync(join(dir, "dryland"), "#!/bin/sh\n");
    chmodSync(join(dir, "dryland"), 0o644);

    const list = await checks(repo, isolatedPath(dir));

    expect(list.find((c) => c.id === "path")).toMatchObject({ ok: false });
  });

  it("reports a missing tracker doc once, under tracker", async () => {
    const repo = TempRepo.create({
      ...SKILL,
      "docs/agents/triage-labels.md": "x\n",
      "docs/agents/domain.md": "x\n",
    });

    const result = await doctor(repo, withDrylandOnPath());

    expect(result.stdout.match(/docs\/agents\/issue-tracker\.md/g)).toHaveLength(1);
    expect(result.stdout).toMatch(/OK\s+setup/);
    expect(result.stdout).toMatch(/FAIL\s+tracker/);
  });

  describe.each([
    { tracker: "GitHub", cli: "gh" },
    { tracker: "GitLab", cli: "glab" },
  ])("with a $tracker tracker", ({ tracker, cli }) => {
    const repo = () =>
      TempRepo.create({ ...DOCS, ...SKILL, "docs/agents/issue-tracker.md": `# Issue tracker: ${tracker}\n` });
    const withCli = (authExit: number) => {
      const stub = stubCli(cli, authExit);
      return { ...isolatedPath(dirWithDryland(), stub.dir), ...stub.env };
    };

    it("passes when the CLI is installed and logged in", async () => {
      const result = await doctor(repo(), withCli(0));

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`OK    tracker  ${tracker}: \`${cli}\` is installed and logged in.`);
    });

    it("fails with an install step when the CLI is missing", async () => {
      const result = await doctor(repo(), withDrylandOnPath());

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain(`FAIL  tracker  ${tracker} tracker, but \`${cli}\` is not installed.`);
      expect(result.stdout).toContain(`Next: Install ${cli} from`);
    });

    it("fails with a login step when the CLI is logged out", async () => {
      const result = await doctor(repo(), withCli(1));

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain(`FAIL  tracker  ${tracker} tracker, but \`${cli}\` is not logged in.`);
      expect(result.stdout).toContain(`Next: Run \`${cli} auth login\`.`);
    });
  });
});
