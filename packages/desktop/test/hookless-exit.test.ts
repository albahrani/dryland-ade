import type { SessionState } from "@dryland/core";
import { describe, expect, it } from "vitest";
import { createActivityStatus } from "../src/main/activity-status.ts";
import { createSessionStatus } from "../src/main/session-status.ts";
import { createTerminalManager } from "../src/main/terminals.ts";
import { FakePtyProvider } from "./fake-pty.ts";

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The wiring of the app's main process for a hookless session: output guesses its state, the exit ends it. */
function setup() {
  const provider = new FakePtyProvider();
  let sessionTerminal = "";
  const status = createSessionStatus();
  const activity = createActivityStatus({ quietMs: 20, report: (id, state) => status.observe(id, state) });
  const terminals = createTerminalManager({
    provider,
    shell: { file: "/bin/fake-sh", args: [] },
    env: {},
    onData: () => {},
    onExit: (terminalId) => {
      // The app finds the session running in the terminal that ended.
      if (terminalId !== sessionTerminal) return;
      activity.forget("session");
      status.exited("session");
    },
  });
  status.launched("session");
  sessionTerminal = terminals.open({ cwd: "/work", onOutput: () => activity.output("session") });
  return { pty: provider.spawned[0], state: (): SessionState | undefined => status.states()["session"] };
}

describe("a hookless session", () => {
  it("is guessed working and idle from its output, then ended when its process exits", async () => {
    const { pty, state } = setup();

    pty?.emit("thinking…");
    expect(state()).toBe("running");
    await pause(60);
    expect(state()).toBe("idle");

    pty?.exit(0);
    expect(state()).toBe("ended");
  });

  it("ends at once when the process exits mid-output, and no pause afterwards revives it", async () => {
    const { pty, state } = setup();

    pty?.emit("working…");
    pty?.exit(1);
    await pause(60);

    expect(state()).toBe("ended");
  });
});
