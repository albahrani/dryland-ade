import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  nodeProcessRunner,
  runDoctor,
  type ProcessResult,
  type ProcessRunner,
} from "../src/index.ts";

function repo(tracker: string): string {
  const root = mkdtempSync(join(tmpdir(), "dryland-doctor-"));
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  const files: Record<string, string> = {
    "docs/agents/issue-tracker.md": `# Issue tracker: ${tracker}\n`,
    "docs/agents/triage-labels.md": "# Labels\n",
    "docs/agents/domain.md": "# Domain\n",
    ".agents/skills/tdd/SKILL.md": "# tdd\n",
  };
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  }
  return root;
}

/** Real git, faked forge CLIs: `forge` maps `"gh --version"`-style invocations to a result. */
function runnerWith(forge: Record<string, ProcessResult>): ProcessRunner {
  return {
    async run(command, args, options) {
      if (command === "git")
        return nodeProcessRunner.run(command, args, options);
      const key = [command, ...args].join(" ");
      return (
        forge[key] ?? {
          stdout: "",
          stderr: `${command}: command not found`,
          exitCode: 127,
        }
      );
    },
  };
}

const ok: ProcessResult = { stdout: "", stderr: "", exitCode: 0 };
const failed: ProcessResult = {
  stdout: "",
  stderr: "not logged in",
  exitCode: 1,
};
const noPath = { env: { PATH: "" } };

describe("runDoctor tracker check", () => {
  it("passes for GitHub when gh is installed and logged in", async () => {
    const runner = runnerWith({ "gh --version": ok, "gh auth status": ok });

    const report = await runDoctor(runner, repo("GitHub"), noPath);

    expect(report.checks.find((c) => c.id === "tracker")).toMatchObject({
      ok: true,
    });
  });

  it("fails clearly for GitHub when gh is missing, without asking for a token", async () => {
    const runner = runnerWith({});

    const report = await runDoctor(runner, repo("GitHub"), noPath);

    const tracker = report.checks.find((c) => c.id === "tracker");
    expect(tracker).toMatchObject({ ok: false });
    expect(tracker?.detail).toContain("`gh` is not installed");
    expect(tracker?.nextAction).toContain("gh auth login");
    expect(JSON.stringify(tracker)).not.toMatch(/token/i);
  });

  it("fails clearly for GitLab when glab is installed but logged out", async () => {
    const runner = runnerWith({
      "glab --version": ok,
      "glab auth status": failed,
    });

    const report = await runDoctor(runner, repo("GitLab"), noPath);

    const tracker = report.checks.find((c) => c.id === "tracker");
    expect(tracker).toMatchObject({ ok: false });
    expect(tracker?.detail).toContain("`glab` is not logged in");
    expect(tracker?.nextAction).toContain("glab auth login");
    expect(report.ok).toBe(false);
  });

  it("does not run any forge CLI for the local Markdown tracker", async () => {
    const runner = runnerWith({});

    const report = await runDoctor(runner, repo("Local Markdown"), noPath);

    expect(report.checks.find((c) => c.id === "tracker")).toMatchObject({
      ok: true,
    });
  });
});

describe("runDoctor outside a git repository", () => {
  it("still reports every check, failing setup and tracker with the cause", async () => {
    const outside = mkdtempSync(join(tmpdir(), "dryland-notrepo-"));

    const report = await runDoctor(nodeProcessRunner, outside, noPath);

    expect(report.ok).toBe(false);
    expect(report.checks.map((c) => [c.id, c.ok])).toEqual([
      ["setup", false],
      ["tracker", false],
      ["path", false],
    ]);
    expect(report.checks[0]?.detail).toContain("not inside a git repository");
  });
});
