import { describe, expect, it } from "vitest";
import { createTerminalManager } from "../src/main/terminals.ts";
import { FakePtyProvider } from "./fake-pty.ts";

function setup() {
  const provider = new FakePtyProvider();
  const data: [string, string][] = [];
  const exits: [string, number][] = [];
  const terminals = createTerminalManager({
    provider,
    shell: { file: "/bin/fake-sh", args: ["-i"] },
    env: { PATH: "/bin" },
    onData: (id, chunk) => data.push([id, chunk]),
    onExit: (id, code) => exits.push([id, code]),
  });
  return { provider, terminals, data, exits };
}

describe("terminal manager", () => {
  it("spawns the shell in the given directory with the given size", () => {
    const { provider, terminals } = setup();
    terminals.open({ cwd: "/repo", cols: 100, rows: 30 });
    expect(provider.spawned[0]?.options).toMatchObject({
      file: "/bin/fake-sh",
      args: ["-i"],
      cwd: "/repo",
      cols: 100,
      rows: 30,
    });
  });

  it("passes the environment to the shell with terminal capabilities set", () => {
    const { provider, terminals } = setup();
    terminals.open({ cwd: "/repo" });
    expect(provider.spawned[0]?.options.env).toMatchObject({ PATH: "/bin", TERM: "xterm-256color" });
  });

  it("routes output to the terminal that produced it", () => {
    const { provider, terminals, data } = setup();
    const a = terminals.open({ cwd: "/repo" });
    const b = terminals.open({ cwd: "/repo" });
    provider.spawned[1]?.emit("from b");
    provider.spawned[0]?.emit("from a");
    expect(data).toEqual([
      [b, "from b"],
      [a, "from a"],
    ]);
  });

  it("writes input and resizes only the addressed terminal", () => {
    const { provider, terminals } = setup();
    const a = terminals.open({ cwd: "/repo" });
    terminals.open({ cwd: "/repo" });
    terminals.write(a, "ls\r");
    terminals.resize(a, 120, 40);
    expect(provider.spawned[0]?.written).toEqual(["ls\r"]);
    expect(provider.spawned[0]?.resizes).toEqual([{ cols: 120, rows: 40 }]);
    expect(provider.spawned[1]?.written).toEqual([]);
    expect(provider.spawned[1]?.resizes).toEqual([]);
  });

  it("ignores sizes a PTY could not take", () => {
    const { provider, terminals } = setup();
    const id = terminals.open({ cwd: "/repo" });
    terminals.resize(id, 0, 24);
    terminals.resize(id, 80.5, 24);
    terminals.resize(id, 80, -1);
    terminals.resize(id, 1e9, 24);
    expect(provider.spawned[0]?.resizes).toEqual([]);
  });

  it("reports an exit once and forgets the terminal", () => {
    const { provider, terminals, exits } = setup();
    const id = terminals.open({ cwd: "/repo" });
    provider.spawned[0]?.exit(3);
    expect(exits).toEqual([[id, 3]]);
    expect(terminals.liveIds()).toEqual([]);
    expect(() => terminals.write(id, "x")).not.toThrow();
  });

  it("kills a closed terminal without reporting an exit", () => {
    const { provider, terminals, exits } = setup();
    const id = terminals.open({ cwd: "/repo" });
    terminals.close(id);
    expect(provider.spawned[0]?.killed).toBe(true);
    expect(exits).toEqual([]);
    expect(terminals.liveIds()).toEqual([]);
  });

  it("kills every live terminal on closeAll", () => {
    const { provider, terminals } = setup();
    terminals.open({ cwd: "/repo" });
    terminals.open({ cwd: "/repo" });
    provider.spawned[0]?.exit(0);
    terminals.closeAll();
    expect(provider.spawned.map((pty) => pty.killed)).toEqual([false, true]);
    expect(terminals.liveIds()).toEqual([]);
  });

  it("ignores input for unknown terminals", () => {
    const { terminals } = setup();
    expect(() => {
      terminals.write("nope", "x");
      terminals.resize("nope", 1, 1);
      terminals.close("nope");
    }).not.toThrow();
  });
});
