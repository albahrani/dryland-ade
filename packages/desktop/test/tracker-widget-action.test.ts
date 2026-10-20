import { mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nodeProcessRunner, type ProcessResult, type ProcessRunner } from "@dryland/core";
import { describe, expect, it } from "vitest";
import { runTrackerWidgetAction } from "../src/main/tracker-widget-action.ts";
import { fixtureRepo } from "./fixture-repo.ts";

/** A path in one spelling: git prints forward slashes, and Windows temp directories have short 8.3 names. */
const same = (path: string) => realpathSync.native(path);

/** Runs git for real, and answers `gh` and `glab` with `forge`, recording every call to them. */
function runnerWith(forge: ProcessResult) {
  const forgeCalls: { command: string; args: string[]; cwd: string | undefined }[] = [];
  const runner: ProcessRunner = {
    run(command, args, options) {
      if (command !== "gh" && command !== "glab") return nodeProcessRunner.run(command, args, options);
      forgeCalls.push({ command, args, cwd: options?.cwd && same(options.cwd) });
      return Promise.resolve(forge);
    },
  };
  return { runner, forgeCalls };
}

const OK: ProcessResult = { stdout: "", stderr: "", exitCode: 0 };

function repoWithTracker(title: string): string {
  const repo = fixtureRepo();
  writeFileSync(join(repo, "docs/agents/issue-tracker.md"), `# Issue tracker: ${title}\n`);
  return repo;
}

describe("the tracker widget's actions", () => {
  it("reveals the issues folder of the main checkout", async () => {
    const repo = fixtureRepo();
    const opened: string[] = [];

    const error = await runTrackerWidgetAction("reveal-issues", {
      runner: runnerWith(OK).runner,
      projectPath: repo,
      openPath: async (path) => (opened.push(path), ""),
    });

    expect(error).toBeNull();
    expect(opened.map(same)).toEqual([same(join(repo, ".scratch"))]);
  });

  it("reports why the issues folder would not open", async () => {
    const error = await runTrackerWidgetAction("reveal-issues", {
      runner: runnerWith(OK).runner,
      projectPath: fixtureRepo(),
      openPath: async () => "no file manager",
    });

    expect(error).toBe("no file manager");
  });

  it.each([
    ["GitHub", "gh"],
    ["GitLab", "glab"],
  ])("opens the issues of a %s project through %s in the main checkout", async (title, cli) => {
    const repo = repoWithTracker(title);
    const { runner, forgeCalls } = runnerWith(OK);

    const error = await runTrackerWidgetAction("open-issues", { runner, projectPath: repo, openPath: async () => "" });

    expect(error).toBeNull();
    expect(forgeCalls).toEqual([{ command: cli, args: ["issue", "list", "--web"], cwd: same(repo) }]);
  });

  it("reports the forge CLI's failure", async () => {
    const { runner } = runnerWith({ stdout: "", stderr: "not logged in\n", exitCode: 1 });

    const error = await runTrackerWidgetAction("open-issues", {
      runner,
      projectPath: repoWithTracker("GitHub"),
      openPath: async () => "",
    });

    expect(error).toBe("gh issue list --web failed: not logged in");
  });

  it("opens no issues of a local markdown project", async () => {
    const { runner, forgeCalls } = runnerWith(OK);

    const error = await runTrackerWidgetAction("open-issues", {
      runner,
      projectPath: fixtureRepo(),
      openPath: async () => "",
    });

    expect(error).toBeNull();
    expect(forgeCalls).toEqual([]);
  });

  it("does nothing outside a git repository, for an unknown action or without a project", async () => {
    const { runner, forgeCalls } = runnerWith(OK);
    const opened: string[] = [];
    const openPath = async (path: string) => (opened.push(path), "");
    const nowhere = mkdtempSync(join(tmpdir(), "dryland-no-repo-"));

    expect(await runTrackerWidgetAction("reveal-issues", { runner, projectPath: nowhere, openPath })).toBeNull();
    expect(await runTrackerWidgetAction("bogus", { runner, projectPath: fixtureRepo(), openPath })).toBeNull();
    expect(await runTrackerWidgetAction("reveal-issues", { runner, projectPath: null, openPath })).toBeNull();
    expect(opened).toEqual([]);
    expect(forgeCalls).toEqual([]);
  });
});
