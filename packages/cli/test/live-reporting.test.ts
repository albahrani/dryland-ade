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

describe("ticket.changed", () => {
  it("is emitted by every mutating ticket and map command, naming the command and what it changed", async () => {
    const repo = shopRepo();
    const { env, received } = await runningApp();
    const commands: [string[], Record<string, string>][] = [
      [["ticket", "claim", "shop/01"], { ticket: "shop/01" }],
      [["ticket", "release", "shop/01"], { ticket: "shop/01" }],
      [["ticket", "create", "--map", "shop", "--title", "Ship it", "--type", "task"], { ticket: "shop/03" }],
      [["ticket", "block", "shop/02", "--add", "01"], { ticket: "shop/02" }],
      [["ticket", "comment", "shop/02", "--text", "Waiting on the cart."], { ticket: "shop/02" }],
      [["ticket", "triage", "shop/02", "--role", "needs-info"], { ticket: "shop/02" }],
      [["ticket", "resolve", "shop/01", "--answer", "Built."], { ticket: "shop/01" }],
      [["map", "index", "shop", "--title", "Cart", "--link", "issues/01-cart.md", "--gist", "Built."], { map: "shop" }],
    ];

    for (const [args] of commands) {
      const result = await repo.run(args, repo.path, { ...env, DRYLAND_SESSION_ID: "session-a" });
      expect(result.exitCode, `${args.join(" ")}: ${result.stderr}`).toBe(0);
    }

    expect(received).toEqual(
      commands.map(([args, changed]) => ({
        session_id: "session-a",
        kind: "ticket.changed",
        timestamp: expect.any(String),
        payload: { command: args.slice(0, 2).join(" "), ...changed },
      })),
    );
  });

  it("is not emitted by commands that only read, or by a write that fails", async () => {
    const repo = shopRepo();
    const { env, received } = await runningApp();

    for (const args of [
      ["ticket", "list"],
      ["ticket", "show", "shop/01"],
      ["map", "show", "shop"],
      ["map", "frontier", "shop"],
    ]) {
      expect((await repo.run(args, repo.path, env)).exitCode).toBe(0);
    }
    expect((await repo.run(["ticket", "claim", "shop/99"], repo.path, env)).exitCode).toBe(1);

    expect(received).toEqual([]);
  });
});

describe("dryland status", () => {
  it("reports a session event to the running app and prints nothing", async () => {
    const repo = TempRepo.create();
    const { env, received } = await runningApp();

    const result = await repo.run(["status", "session.waiting", "--payload", '{"reason":"permission"}'], repo.path, {
      ...env,
      DRYLAND_SESSION_ID: "session-a",
    });

    expect(result).toMatchObject({ exitCode: 0, stdout: "", stderr: "" });
    expect(received).toEqual([
      {
        session_id: "session-a",
        kind: "session.waiting",
        timestamp: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
        payload: { reason: "permission" },
      },
    ]);
  });

  it("exits 0 with no output when the app is not running", async () => {
    const repo = TempRepo.create();

    const result = await repo.run(["status", "session.running"]);

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
    const result = await repo.run(["status", "session.running"], repo.path, { DRYLAND_APP_DIR: dir });
    const elapsed = Date.now() - started;
    silent.close();

    expect(result).toEqual({ exitCode: 0, stdout: "", stderr: "" });
    expect(elapsed).toBeLessThan(3_000);
  });

  it("refuses an unknown event kind", async () => {
    const repo = TempRepo.create();

    const result = await repo.run(["status", "session.exploded"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("session.exploded");
    expect(result.stderr).toContain("session.running");
  });
});
