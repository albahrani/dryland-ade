import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isolatedPath, stubCli, TempRepo, tempDir, WINDOWS } from "./harness.ts";

const DOCS = {
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
  const name = WINDOWS ? "dryland.cmd" : "dryland";
  writeFileSync(join(dir, name), "@echo off\n");
  chmodSync(join(dir, name), 0o755);
  return dir;
}

const withDrylandOnPath = () => isolatedPath(dirWithDryland());
const withoutDrylandOnPath = () => isolatedPath(tempDir("dryland-empty-"));

/** A repo with the skills, the docs and a state store: the healthy default. */
const healthyRepo = (): Promise<TempRepo> => TempRepo.createStore([], { ...DOCS, ...SKILL });

function doctor(repo: TempRepo, env: Record<string, string>, ...args: string[]) {
  return repo.run(["doctor", ...args], repo.path, env);
}

async function checks(repo: TempRepo, env: Record<string, string>): Promise<Check[]> {
  const result = await doctor(repo, env, "--json");
  return (JSON.parse(result.stdout) as { checks: Check[] }).checks;
}

describe("dryland doctor", () => {
  it("reports every check as OK and exits 0 in a healthy default repo", async () => {
    const repo = await healthyRepo();

    const result = await doctor(repo, withDrylandOnPath());

    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/OK\s+setup/);
    expect(result.stdout).toMatch(/OK\s+store/);
    expect(result.stdout).toMatch(/OK\s+path/);
    expect(result.stdout).not.toMatch(/FAIL/);
  });

  it("names what is missing and the next action, and exits non-zero, when dryland is not on PATH", async () => {
    const repo = await healthyRepo();

    const result = await doctor(repo, withoutDrylandOnPath());

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatch(/FAIL\s+path\s+dryland is not on PATH/);
    expect(result.stdout).toMatch(/Next: .*PATH/);
    expect(result.stdout).toMatch(/OK\s+setup/);
  });

  it("reports a repo without the skills set up, with /setup-matt-pocock-skills as the next action", async () => {
    const repo = await TempRepo.createStore([]);

    const result = await doctor(repo, withDrylandOnPath());

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatch(/FAIL\s+setup/);
    expect(result.stdout).toContain("skills");
    expect(result.stdout).toContain("docs/agents/triage-labels.md");
    expect(result.stdout).toContain("Next: Run /setup-matt-pocock-skills");
  });

  it("reports a repo without a state store, naming `dryland init`", async () => {
    const repo = TempRepo.create({ ...DOCS, ...SKILL });

    const result = await doctor(repo, withDrylandOnPath());

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatch(/FAIL\s+store\s+This repo has no Dryland state store/);
    expect(result.stdout).toContain("Next: Run `dryland init`");
    expect(result.stdout).toMatch(/OK\s+setup/);
  });

  it("returns the checks as structured data with --json, still exiting non-zero on a failure", async () => {
    const repo = await TempRepo.createStore([], { ...DOCS });

    const result = await doctor(repo, withDrylandOnPath(), "--json");

    expect(result.exitCode).toBe(1);
    const report = JSON.parse(result.stdout) as {
      ok: boolean;
      checks: Check[];
    };
    expect(report.ok).toBe(false);
    expect(report.checks.map((c) => [c.id, c.ok])).toEqual([
      ["setup", false],
      ["store", true],
      ["path", true],
      ["hooks", true],
    ]);
    expect(report.checks[0]?.nextAction).toContain("/setup-matt-pocock-skills");
    expect(report.checks[1]?.nextAction).toBeNull();
  });

  it("works from a linked worktree, reading the main checkout's setup", async () => {
    const repo = await healthyRepo();
    const worktree = repo.addWorktree("feature/x");

    const result = await repo.run(["doctor"], worktree, withDrylandOnPath());

    expect(result.exitCode).toBe(0);
  });

  it("does not count a directory named dryland as the launcher", async () => {
    const repo = await healthyRepo();
    const dir = tempDir("dryland-dirbin-");
    mkdirSync(join(dir, "dryland"));
    mkdirSync(join(dir, "dryland.cmd"));

    const list = await checks(repo, isolatedPath(dir));

    expect(list.find((c) => c.id === "path")).toMatchObject({ ok: false });
  });

  it.skipIf(WINDOWS)("does not count a dryland without the executable bit", async () => {
    const repo = await healthyRepo();
    const dir = tempDir("dryland-noexec-");
    writeFileSync(join(dir, "dryland"), "#!/bin/sh\n");
    chmodSync(join(dir, "dryland"), 0o644);

    const list = await checks(repo, isolatedPath(dir));

    expect(list.find((c) => c.id === "path")).toMatchObject({ ok: false });
  });
});

describe("dryland doctor --install-hooks and --remove-hooks", () => {
  const CONFIG = '{\n  "model": "gpt-5",\n  "trustedFolders": [\n    "/somewhere"\n  ],\n  "banner": "never"\n}\n';

  /** A repo with a linked worktree, Copilot on PATH, and a Copilot home holding `config`. */
  async function copilotRepo(config: string) {
    const repo = await healthyRepo();
    const worktree = repo.addWorktree("feature/x");
    const stub = stubCli("copilot", 0);
    const home = tempDir("dryland-copilot-home-");
    const configFile = join(home, "config.json");
    writeFileSync(configFile, config);
    const env = { ...isolatedPath(dirWithDryland(), stub.dir), ...stub.env, COPILOT_HOME: home };
    return { repo, worktree, home, configFile, env };
  }

  it("installs the hook file and trusts the worktrees, reports them, and removes both leaving the config as it was", async () => {
    const { repo, worktree, home, configFile, env } = await copilotRepo(CONFIG);

    const missing = await doctor(repo, env);
    expect(missing.exitCode).toBe(1);
    expect(missing.stdout).toMatch(/FAIL\s+hooks/);
    expect(missing.stdout).toContain("Next: Run `dryland doctor --install-hooks`");

    const installed = await doctor(repo, env, "--install-hooks");
    expect(installed.exitCode).toBe(0);
    expect(installed.stdout).toMatch(/OK\s+hooks\s+.*1 of 1 worktrees are trusted/);
    expect(existsSync(join(home, "hooks", "dryland.json"))).toBe(true);
    const config = JSON.parse(readFileSync(configFile, "utf8")) as Record<string, unknown>;
    expect(config).toMatchObject({ model: "gpt-5", banner: "never" });
    expect(JSON.stringify(config["trustedFolders"])).toContain(realpathSync.native(worktree).replaceAll("\\", "\\\\"));

    const removed = await doctor(repo, env, "--remove-hooks");
    expect(removed.stdout).toMatch(/FAIL\s+hooks/);
    expect(existsSync(join(home, "hooks", "dryland.json"))).toBe(false);
    expect(readFileSync(configFile, "utf8")).toBe(CONFIG);
  });

  it("skips a config that is not valid JSON with a warning, installing only the hook file", async () => {
    const { repo, home, configFile, env } = await copilotRepo("{ not json");

    const result = await doctor(repo, env, "--install-hooks");

    expect(result.stderr).toContain("not valid JSON");
    expect(existsSync(join(home, "hooks", "dryland.json"))).toBe(true);
    expect(readFileSync(configFile, "utf8")).toBe("{ not json");
  });

  it("is refused when both are given", async () => {
    const { repo, env } = await copilotRepo(CONFIG);

    const result = await doctor(repo, env, "--install-hooks", "--remove-hooks");

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("contradict");
  });
});
