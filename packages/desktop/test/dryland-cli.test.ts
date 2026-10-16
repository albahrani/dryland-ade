import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { nodeProcessRunner, readSessionIndex } from "@dryland/core";
import { describe, expect, it } from "vitest";
import { createDrylandCli } from "../src/main/dryland-cli.ts";
import { fixtureRepo } from "./fixture-repo.ts";

/** The real `dryland` bundle, built by the test suite's global setup; Node stands in for the app's Electron. */
const CLI = fileURLToPath(new URL("../../cli/dist/dryland.mjs", import.meta.url));

const git = (repo: string, ...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
const ticketFile = (repo: string, name: string) => readFileSync(join(repo, ".scratch/shop/issues", name), "utf8");

function cli(env: Record<string, string | undefined> = process.env) {
  // No app listens for these tests, even when they run inside a Dryland session.
  const noApp = {
    DRYLAND_PORT: undefined,
    DRYLAND_TOKEN: undefined,
    DRYLAND_APP_DIR: mkdtempSync(join(tmpdir(), "dryland-no-app-")),
  };
  return createDrylandCli({ runtime: process.execPath, cli: CLI, env: { ...env, ...noApp } });
}

describe("running dryland from the app", () => {
  it("runs the command in the project and reports success", async () => {
    const repo = fixtureRepo();

    const result = await cli().run(["ticket", "claim", "shop/02"], { cwd: repo });

    expect(result).toEqual({ ok: true, warnings: [] });
    expect(ticketFile(repo, "02-grill.md")).toContain("Status: claimed");
    expect(git(repo, "log", "-1", "--format=%s")).toBe("Claim shop/02 for main");
  });

  it("claims for the branch it runs in, never for a session id given or in the app's own environment", async () => {
    const repo = fixtureRepo();
    const inherited = cli({ ...process.env, DRYLAND_SESSION_ID: "the-session-dryland-was-started-from" });

    await inherited.run(["ticket", "claim", "shop/02"], { cwd: repo });
    await inherited.run(["ticket", "claim", "shop/03"], { cwd: repo, sessionId: "session-a" });

    expect(git(repo, "log", "-2", "--format=%s")).toBe("Claim shop/03 for main\nClaim shop/02 for main");
  });

  it("records no Agent CLI session the app was started from in the session index", async () => {
    const repo = fixtureRepo();
    const inherited = cli({ ...process.env, CLAUDE_CODE_SESSION_ID: "the-cli-session-dryland-was-started-from" });

    await inherited.run(["ticket", "claim", "shop/02"], { cwd: repo });

    expect((await readSessionIndex(nodeProcessRunner, repo)).index.items).toEqual({});
  });

  it("leaves the change uncommitted with --no-commit", async () => {
    const repo = fixtureRepo();
    const head = git(repo, "rev-parse", "HEAD");

    const result = await cli().run(["ticket", "claim", "shop/02", "--no-commit"], { cwd: repo });

    expect(result.ok).toBe(true);
    expect(ticketFile(repo, "02-grill.md")).toContain("Status: claimed");
    expect(git(repo, "rev-parse", "HEAD")).toBe(head);
  });

  it("reports dryland's error and next action when the command fails", async () => {
    const repo = fixtureRepo();

    const result = await cli().run(["ticket", "release", "shop/02"], { cwd: repo });

    expect(result).toEqual({
      ok: false,
      message: "Ticket shop/02 is not claimed, so there is nothing to release.",
      nextAction: "Run `dryland ticket show shop/02` to see its state.",
    });
  });

  it("passes on dryland's warnings", async () => {
    const repo = fixtureRepo();
    git(repo, "checkout", "-q", "-b", "elsewhere");

    const result = await cli().run(["ticket", "claim", "shop/02"], { cwd: repo });

    expect(result.ok).toBe(true);
    expect(result.ok && result.warnings[0]).toContain("not the default branch main");
  });
});
