import { createServer, type AddressInfo } from "node:net";
import { type LiveEvent, type LiveListener, startLiveListener } from "@dryland/core";
import { afterEach, describe, expect, it } from "vitest";
import { TempRepo } from "./harness.ts";

const listeners: LiveListener[] = [];
afterEach(async () => {
  await Promise.all(listeners.splice(0).map((listener) => listener.close()));
});

/** A running app's listener, and the env a Dryland terminal gets to reach it. */
async function runningApp(): Promise<{ env: Record<string, string>; received: LiveEvent[] }> {
  const received: LiveEvent[] = [];
  const listener = await startLiveListener({ onEvent: (e) => received.push(e) });
  listeners.push(listener);
  return { env: { DRYLAND_PORT: String(listener.port), DRYLAND_TOKEN: listener.token }, received };
}

const SHOP: Parameters<typeof TempRepo.createStore>[0] = [
  {
    effort: "shop",
    map: { title: "Shop", destination: "Sell things." },
    tickets: [{ title: "Build the cart" }, { title: "Take payments" }],
  },
];

describe("ticket commands", () => {
  it("send the app nothing: only session state reports use the channel", async () => {
    const repo = await TempRepo.createStore(SHOP);
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

  it("reaches no app from a terminal that was not given one, even while an app runs", async () => {
    const repo = TempRepo.create();
    const { received } = await runningApp();

    const result = await repo.run(["status", "running"]);

    expect(result).toEqual({ exitCode: 0, stdout: "", stderr: "" });
    expect(received).toEqual([]);
  });

  it("gives up quickly and silently when the port in the env points at something that never answers", async () => {
    const repo = TempRepo.create();
    // Accepts connections and never replies, like a hung app or an unrelated program on a reused port.
    const silent = createServer(() => undefined);
    await new Promise<void>((resolve) => silent.listen(0, "127.0.0.1", resolve));
    const { port } = silent.address() as AddressInfo;

    const started = Date.now();
    const result = await repo.run(["status", "running"], repo.path, {
      DRYLAND_PORT: String(port),
      DRYLAND_TOKEN: "stale",
    });
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
