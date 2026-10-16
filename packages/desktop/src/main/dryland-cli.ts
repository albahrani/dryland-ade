import { execFile } from "node:child_process";
import { AGENT_ADAPTERS } from "@dryland/core";
import type { TicketActionResult } from "../shared/api.ts";

export interface DrylandCliOptions {
  /** The executable that runs the CLI: the app's Electron binary, which acts as Node with `ELECTRON_RUN_AS_NODE`. */
  runtime: string;
  /** The bundled `dryland` CLI script. */
  cli: string;
  /** The environment to run in, read on every run: it carries the live listener's port and token once it is up. */
  env: Record<string, string | undefined>;
}

/** How a `dryland` command went: its warnings, or its error and the next action it names. */
export type DrylandRun = TicketActionResult;

export interface DrylandCli {
  /**
   * Runs `dryland <args>` in `cwd`. A claim is made for the branch of `cwd`. Live events name `sessionId` when given:
   * never a session the app itself was started from, and no Agent CLI session it was started from is recorded in the
   * session index.
   */
  run(args: string[], options: { cwd: string; sessionId?: string }): Promise<DrylandRun>;
}

const WARNING = "dryland: warning: ";

/** Reads what `dryland` wrote to stderr: `dryland: warning: ...` lines, or `dryland: <error>` and `Next: <action>`. */
function parse(exitCode: number, stderr: string): DrylandRun {
  const lines = stderr.split(/\r?\n/).filter((line) => line !== "");
  if (exitCode === 0) {
    return { ok: true, warnings: lines.filter((l) => l.startsWith(WARNING)).map((l) => l.slice(WARNING.length)) };
  }
  const error = lines.find((l) => l.startsWith("dryland: ") && !l.startsWith(WARNING));
  const next = lines.find((l) => l.startsWith("Next: "));
  return {
    ok: false,
    message: error?.slice("dryland: ".length) ?? (lines.slice(-3).join(" ") || `dryland exited with ${exitCode}.`),
    nextAction: next?.slice("Next: ".length) ?? "See the output above, or run the command in a terminal.",
  };
}

/** The app's only way to write tracker files: the same `dryland` sessions and the user run. */
export function createDrylandCli({ runtime, cli, env }: DrylandCliOptions): DrylandCli {
  return {
    run(args, { cwd, sessionId }) {
      // undefined drops a session id the app inherited; the child is spawned without it.
      const runEnv: Record<string, string | undefined> = {
        ...env,
        ELECTRON_RUN_AS_NODE: "1",
        DRYLAND_SESSION_ID: sessionId,
      };
      for (const { sessionEnv } of AGENT_ADAPTERS) if (sessionEnv !== null) runEnv[sessionEnv] = undefined;
      return new Promise((resolve) => {
        execFile(
          runtime,
          [cli, ...args],
          { cwd, env: runEnv, encoding: "utf8", windowsHide: true },
          (error, _out, stderr) => {
            const exitCode = error === null ? 0 : typeof error.code === "number" ? error.code : 1;
            resolve(parse(exitCode, error !== null && stderr === "" ? error.message : stderr));
          },
        );
      });
    },
  };
}
