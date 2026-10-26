import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { liveLockFile, type LiveEvent, type LiveListener, startLiveListener } from "@dryland/core";
import { afterEach, describe, expect, it } from "vitest";
import { TempRepo } from "./harness.ts";

const listeners: LiveListener[] = [];
afterEach(async () => {
  await Promise.all(listeners.splice(0).map((listener) => listener.close()));
});

/** A running app's listener in a fresh app directory, and the env that makes `dryland` find it. */
async function runningApp(): Promise<{ env: Record<string, string>; received: LiveEvent[] }> {
  const dir = mkdtempSync(join(tmpdir(), "dryland-app-"));
  const received: LiveEvent[] = [];
  listeners.push(
    await startLiveListener({ lockFile: liveLockFile({ DRYLAND_APP_DIR: dir }), onEvent: (e) => received.push(e) }),
  );
  return { env: { DRYLAND_APP_DIR: dir }, received };
}

const TICKET = (title: string, status = "ready-for-agent") => `# ${title}\n\nType: task\nStatus: ${status}\n\nBody.\n`;

function shopRepo(): TempRepo {
  return TempRepo.create({
    "docs/agents/issue-tracker.md": "# Issue tracker: Local Markdown\n",
    ".scratch/shop/map.md": "# Map: Shop\n\n## Destination\n\nSell things.\n\n## Decisions so far\n\n",
    ".scratch/shop/issues/01-cart.md": TICKET("Build the cart"),
    ".scratch/shop/issues/02-pay.md": TICKET("Take payments"),
  });
}

describe("ticket commands", () => {
  it("send the app nothing: only session state reports use the channel", async () => {
    const repo = shopRepo();
    const { env, received } = await runningApp();

    for (const args of [
      ["ticket", "list"],
      ["ticket", "claim", "shop/01"],
      ["ticket", "comment", "shop/02", "--text", "Waiting on the cart."],
      ["ticket", "resolve", "shop/01", "--answer", "Built."],
      ["map", "show", "shop"],
    ]) {
      const result = await repo.run(args, repo.path, { ...env, DRYLAND_SESSION_ID: "session-a" });
      expect(result.exitCode, `${args.join(" ")}: ${result.stderr}`).toBe(0);
    }

    expect(received).toEqual([]);
  });
});

describe("dryland status", () => {
  it("reports a session event to the running app and prints nothing", async () => {
    const repo = TempRepo.create();
    const { env, received } = await runningApp();

    const result = await repo.run(["status", "waiting"], repo.path, {
      ...env,
      DRYLAND_SESSION_ID: "session-a",
    });

    expect(result).toMatchObject({ exitCode: 0, stdout: "", stderr: "" });
    expect(received).toEqual([
      {
        session_id: "session-a",
        state: "waiting",
        timestamp: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
      },
    ]);
  });

  it("sends the Agent CLI's session id when it runs in a CLI session, and none outside one", async () => {
    const repo = TempRepo.create();
    const { env, received } = await runningApp();

    await repo.run(["status", "idle"], repo.path, { ...env, CLAUDE_CODE_SESSION_ID: "cli-1" });
    await repo.run(["status", "idle"], repo.path, env);

    expect(received.map((e) => e.agent_session_id)).toEqual(["cli-1", undefined]);
    expect(received[1]).not.toHaveProperty("agent_session_id");
  });

  it("exits 0 with no output when the app is not running", async () => {
    const repo = TempRepo.create();

    const result = await repo.run(["status", "running"]);

    expect(result).toEqual({ exitCode: 0, stdout: "", stderr: "" });
  });

  it("gives up quickly and silently when the lock file points at something that never answers", async () => {
    const repo = TempRepo.create();
    const dir = mkdtempSync(join(tmpdir(), "dryland-app-"));
    // Accepts connections and never replies, like a hung app or an unrelated program on a reused port.
    const silent = createServer(() => undefined);
    await new Promise<void>((resolve) => silent.listen(0, "127.0.0.1", resolve));
    const { port } = silent.address() as AddressInfo;
    writeFileSync(liveLockFile({ DRYLAND_APP_DIR: dir }), JSON.stringify({ port, token: "stale" }));

    const started = Date.now();
    const result = await repo.run(["status", "running"], repo.path, { DRYLAND_APP_DIR: dir });
    const elapsed = Date.now() - started;
    silent.close();

    expect(result).toEqual({ exitCode: 0, stdout: "", stderr: "" });
    expect(elapsed).toBeLessThan(3_000);
  });

  it("refuses an unknown session state", async () => {
    const repo = TempRepo.create();

    const result = await repo.run(["status", "exploded"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("exploded");
    expect(result.stderr).toContain("running");
  });
});
