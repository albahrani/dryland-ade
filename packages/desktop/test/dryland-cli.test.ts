import { fileURLToPath } from "node:url";
import { nodeProcessRunner, readSessionIndex } from "@dryland/core";
import { describe, expect, it } from "vitest";
import { createDrylandCli } from "../src/main/dryland-cli.ts";
import { dryland, fixtureRepo } from "./fixture-repo.ts";

/** The real `dryland` bundle, built by the test suite's global setup; Node stands in for the app's Electron. */
const CLI = fileURLToPath(new URL("../../cli/dist/dryland.mjs", import.meta.url));

const ticket = (repo: string, ref: string) =>
  JSON.parse(dryland(repo, undefined, "ticket", "show", ref, "--json")) as { claim: { holder: string } | null };

function cli(env: Record<string, string | undefined> = process.env) {
  // No app listens for these tests, even when they run inside a Dryland session.
  const noApp = { DRYLAND_PORT: undefined, DRYLAND_TOKEN: undefined };
  return createDrylandCli({ runtime: process.execPath, cli: CLI, env: { ...env, ...noApp } });
}

describe("running dryland from the app", () => {
  it("runs the command in the project and reports success", async () => {
    const repo = fixtureRepo();

    const result = await cli().run(["ticket", "claim", "shop/02"], { cwd: repo });

    expect(result).toEqual({ ok: true, warnings: [] });
    expect(ticket(repo, "shop/02").claim?.holder).toBe("main");
  });

  it("claims for the branch it runs in, never for a session id given or in the app's own environment", async () => {
    const repo = fixtureRepo();
    const inherited = cli({ ...process.env, DRYLAND_SESSION_ID: "the-session-dryland-was-started-from" });

    await inherited.run(["ticket", "claim", "shop/02"], { cwd: repo });
    await inherited.run(["ticket", "claim", "shop/03"], { cwd: repo, sessionId: "session-a" });

    expect(ticket(repo, "shop/02").claim?.holder).toBe("main");
    expect(ticket(repo, "shop/03").claim?.holder).toBe("main");
  });

  it("records no Agent CLI session the app was started from in the session index", async () => {
    const repo = fixtureRepo();
    const inherited = cli({ ...process.env, CLAUDE_CODE_SESSION_ID: "the-cli-session-dryland-was-started-from" });

    await inherited.run(["ticket", "claim", "shop/02"], { cwd: repo });

    expect((await readSessionIndex(nodeProcessRunner, repo)).index.items).toEqual({});
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
});
