import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type QuitSession,
  QUIT_ANSWER_MS,
  quitConfirmation,
  quitListing,
  runShutdown,
  SHUTDOWN_BUDGET_MS,
  shutdownSteps,
  whoAsks,
} from "../src/main/lifecycle.ts";
import { createTerminalManager } from "../src/main/terminals.ts";
import { FakePtyProvider } from "./fake-pty.ts";

function terminalsWithTwoOpen() {
  const provider = new FakePtyProvider();
  const terminals = createTerminalManager({
    provider,
    shell: { file: "/bin/fake-sh", args: [] },
    env: {},
    onData: () => {},
    onExit: () => {},
  });
  terminals.open({ cwd: "/repo" });
  terminals.open({ cwd: "/repo" });
  return { provider, terminals };
}

const later = (ms: number, then: () => void) =>
  new Promise<void>((resolve) =>
    setTimeout(() => {
      then();
      resolve();
    }, ms),
  );

describe("shutdown", () => {
  afterEach(() => void vi.useRealTimers());

  it("kills every PTY first, then flushes in order", async () => {
    const { provider, terminals } = terminalsWithTwoOpen();
    const order: string[] = [];
    const report = await runShutdown(
      shutdownSteps({ closeAll: () => (terminals.closeAll(), order.push("kill")) }, [
        { name: "session index", run: () => later(10, () => order.push("index")) },
        { name: "UI state", run: () => void order.push("ui") },
      ]),
    );
    expect(order).toEqual(["kill", "index", "ui"]);
    expect(provider.spawned.every((pty) => pty.killed)).toBe(true);
    expect(terminals.liveIds()).toEqual([]);
    expect(report).toEqual({ completed: ["kill PTYs", "session index", "UI state"], failed: [], abandoned: [] });
  });

  it("kills the PTYs before the first await, so a process killed right after leaves none behind", () => {
    const { provider, terminals } = terminalsWithTwoOpen();
    void runShutdown(shutdownSteps(terminals, [{ name: "slow", run: () => new Promise(() => {}) }]));
    expect(provider.spawned.every((pty) => pty.killed)).toBe(true);
  });

  it("finishes within the 2-second budget, abandoning a slow flush and every step after it", async () => {
    vi.useFakeTimers();
    const { provider, terminals } = terminalsWithTwoOpen();
    const flushed: string[] = [];
    const done = vi.fn();
    void runShutdown(
      shutdownSteps(terminals, [
        { name: "session index", run: () => later(5000, () => flushed.push("index")) },
        { name: "UI state", run: () => void flushed.push("ui") },
      ]),
    ).then(done);

    await vi.advanceTimersByTimeAsync(SHUTDOWN_BUDGET_MS - 1);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toHaveBeenCalledWith({
      completed: ["kill PTYs"],
      failed: [],
      abandoned: ["session index", "UI state"],
    });
    expect(flushed).toEqual([]);
    expect(provider.spawned.every((pty) => pty.killed)).toBe(true);
  });

  it("shares one budget across steps, so several slow ones cannot add up past it", async () => {
    vi.useFakeTimers();
    const done = vi.fn();
    void runShutdown([
      { name: "a", run: () => later(1500, () => {}) },
      { name: "b", run: () => later(1500, () => {}) },
    ]).then(done);
    await vi.advanceTimersByTimeAsync(SHUTDOWN_BUDGET_MS);
    expect(done).toHaveBeenCalledWith({ completed: ["a"], failed: [], abandoned: ["b"] });
  });

  it("goes on after a step that fails", async () => {
    const report = await runShutdown([
      {
        name: "throws",
        run: () => {
          throw new Error("disk full");
        },
      },
      { name: "rejects", run: () => Promise.reject(new Error("gone")) },
      { name: "fine", run: () => {} },
    ]);
    expect(report).toEqual({ completed: ["fine"], failed: ["throws", "rejects"], abandoned: [] });
  });
});

const session = (id: string, ticket: QuitSession["ticket"], map: string | null, branch: string): QuitSession => ({
  id,
  agent: { name: "Claude Code" },
  ticket,
  map,
  worktree: { branch },
});

const confirm = (...args: Parameters<typeof quitListing>) => quitConfirmation(quitListing(...args));

describe("quit confirmation", () => {
  it("asks nothing when no session runs", () => {
    expect(confirm([], {})).toBeNull();
  });

  it("lists every running session, those waiting on the user first", () => {
    const confirmation = confirm(
      [
        session("a", { map: "shop", id: "02" }, "shop", "shop/02-grill"),
        session("b", null, "shop", "shop/scratch-wayfinder"),
        session("c", { map: "shop", id: "03" }, "shop", "shop/03-cart"),
      ],
      { a: "running", c: "waiting" },
    );
    expect(confirmation?.message).toBe("3 sessions are still running. Quit Dryland and stop them?");
    expect(confirmation?.detail.split("\n").slice(0, 3)).toEqual([
      "• Claude Code shop/03 (waiting for you) in shop/03-cart",
      "• Claude Code shop/02 (working) in shop/02-grill",
      "• Claude Code shop (launched) in shop/scratch-wayfinder",
    ]);
    expect(confirmation?.detail).toContain("Claims are kept");
    expect(confirmation?.buttons).toEqual(["Quit", "Cancel"]);
  });

  it("leaves out a session whose CLI reported its end, and asks nothing when only such remain", () => {
    const ended = session("a", { map: "shop", id: "02" }, "shop", "shop/02-grill");
    expect(confirm([ended], { a: "ended" })).toBeNull();
    const confirmation = confirm([ended, session("b", null, "shop", "shop/scratch-wayfinder")], {
      a: "ended",
    });
    expect(confirmation?.message).toBe("1 session is still running. Quit Dryland and stop it?");
    expect(confirmation?.detail).not.toContain("shop/02");
  });

  it("lists sessions with unseen output after those waiting and before the rest, saying so", () => {
    const confirmation = confirm(
      [
        session("a", { map: "shop", id: "02" }, "shop", "shop/02-grill"),
        session("b", { map: "shop", id: "03" }, "shop", "shop/03-cart"),
        session("c", { map: "shop", id: "04" }, "shop", "shop/04-pay"),
      ],
      { a: "running", b: "idle", c: "waiting" },
      new Set(["b"]),
    );
    expect(confirmation?.detail.split("\n").slice(0, 3)).toEqual([
      "• Claude Code shop/04 (waiting for you) in shop/04-pay",
      "• Claude Code shop/03 (idle, unseen output) in shop/03-cart",
      "• Claude Code shop/02 (working) in shop/02-grill",
    ]);
  });

  it("speaks of one session in the singular", () => {
    const confirmation = confirm([session("a", null, null, "new-map/scratch-wayfinder")], {});
    expect(confirmation?.message).toBe("1 session is still running. Quit Dryland and stop it?");
    expect(confirmation?.detail).toContain("• Claude Code new map (launched) in new-map/scratch-wayfinder");
  });
});

describe("a quit the user starts", () => {
  afterEach(() => void vi.useRealTimers());

  it("runs without a deadline, however slow a step is, and reports each step's progress", async () => {
    vi.useFakeTimers();
    const progress: string[] = [];
    const done = vi.fn();
    void runShutdown(
      [
        { name: "kill PTYs", run: () => {} },
        { name: "flush", run: () => later(30_000, () => {}) },
      ],
      null,
      { onStep: (step, state) => progress.push(`${step}:${state}`) },
    ).then(done);
    await vi.advanceTimersByTimeAsync(SHUTDOWN_BUDGET_MS * 5);
    expect(done).not.toHaveBeenCalled();
    expect(progress).toEqual([
      "kill PTYs:pending",
      "flush:pending",
      "kill PTYs:running",
      "kill PTYs:done",
      "flush:running",
    ]);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(done).toHaveBeenCalledWith({ completed: ["kill PTYs", "flush"], failed: [], abandoned: [] });
    expect(progress.at(-1)).toBe("flush:done");
  });

  it("quits now: abandons a slow step and the ones after it at once", async () => {
    vi.useFakeTimers();
    const abandon = new AbortController();
    const progress: string[] = [];
    const done = vi.fn();
    void runShutdown(
      [
        { name: "kill PTYs", run: () => {} },
        { name: "flush", run: () => later(30_000, () => {}) },
        { name: "after", run: () => {} },
      ],
      null,
      { onStep: (step, state) => progress.push(`${step}:${state}`), abandon: abandon.signal },
    ).then(done);
    await vi.advanceTimersByTimeAsync(5000);
    expect(done).not.toHaveBeenCalled();
    abandon.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toHaveBeenCalledWith({ completed: ["kill PTYs"], failed: [], abandoned: ["flush", "after"] });
    expect(progress.slice(-2)).toEqual(["flush:abandoned", "after:abandoned"]);
  });
});

describe("who asks about quitting", () => {
  afterEach(() => void vi.useRealTimers());

  it("is the window when it acknowledges the request", async () => {
    vi.useFakeTimers();
    expect(await whoAsks(Promise.resolve())).toBe("in-app");
  });

  it("is the native message box when the window stays silent past the wait", async () => {
    vi.useFakeTimers();
    const asker = whoAsks(new Promise(() => {}));
    await vi.advanceTimersByTimeAsync(QUIT_ANSWER_MS - 1);
    let settled = false;
    void asker.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await asker).toBe("native");
  });
});
