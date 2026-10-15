import { randomUUID } from "node:crypto";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { delimiter, extname, join } from "node:path";
import {
  AGENT_ADAPTERS,
  type AgentAdapter,
  blocksInput,
  commandForTicket,
  DrylandError,
  envKey,
  findExecutable,
  findMainCheckout,
  hookSettings,
  nextSteps,
  type ProcessRunner,
  readRepoSnapshot,
  readTickets,
  skillCommand,
  type TicketRef,
  worktreeForTicket,
} from "@dryland/core";
import type { AgentAvailability, SessionInfo } from "../shared/api.ts";
import { trackerArgs } from "../shared/tracker-actions.ts";
import type { DrylandCli } from "./dryland-cli.ts";
import { createPretyper, PRETYPE_TIMING, type PretypeTiming } from "./pretype.ts";
import type { ShellSpec } from "./shell.ts";
import type { TerminalManager } from "./terminals.ts";

export interface WorkStarterOptions {
  terminals: TerminalManager;
  runner: ProcessRunner;
  /** The environment sessions inherit and Agent CLIs are looked up in. */
  env: Record<string, string | undefined>;
  /** The directory holding the `dryland` launcher, put first on every session's `PATH`. */
  launcherDir: string;
  /** Dryland's own directory for the settings files that inject status hooks; never the user's CLI config. */
  hooksDir: string;
  /** Runs `dryland`, through which the ticket is claimed for its session. */
  dryland: DrylandCli;
  /** Whether tracker writes in the project are committed. */
  autoCommit: (projectPath: string) => boolean;
  pretype?: PretypeTiming;
}

/** A session that started, and what the user should know about it, such as a claim that could not be made. */
export interface StartedWork {
  session: SessionInfo;
  warnings: string[];
}

export interface WorkStarter {
  /** Every Agent adapter, with whether its CLI is installed. */
  listAgents(): Promise<AgentAvailability[]>;
  /**
   * Opens the Agent CLI in the ticket's worktree, created or reused, with the ticket's next-step command typed but
   * not submitted, and claims the ticket for the session. A ticket someone else holds keeps its claim and the
   * session starts anyway. Fails with a `DrylandError`, before touching anything, when the CLI is not installed.
   */
  startWork(projectPath: string, ticket: TicketRef, agentId: string): Promise<StartedWork>;
  /** The sessions started so far, as recorded at spawn. */
  sessions(): SessionInfo[];
}

/** Windows runs a `.cmd` or `.bat` only through `cmd.exe`; anything else is spawned directly. */
function programFor(executable: string, args: string[], env: Record<string, string | undefined>): ShellSpec {
  if (process.platform === "win32" && [".cmd", ".bat"].includes(extname(executable).toLowerCase())) {
    return { file: env[envKey(env, "ComSpec")] || "cmd.exe", args: ["/d", "/c", executable, ...args] };
  }
  return { file: executable, args };
}

/**
 * The adapter's launch arguments, plus its settings flag naming a file in `hooksDir` that holds the status hooks,
 * written fresh on every launch. A file rather than inline JSON, which `cmd.exe` would mangle.
 */
function launchArgs(adapter: AgentAdapter, hooksDir: string): string[] {
  if (adapter.hookInjection.kind !== "settings-flag") return [...adapter.launchArgs];
  mkdirSync(hooksDir, { recursive: true });
  const file = join(hooksDir, `${adapter.id}.json`);
  // Renamed into place, so a CLI starting in parallel never reads half a file.
  const temporary = `${file}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(hookSettings(adapter.statusEvents), null, 2));
  renameSync(temporary, file);
  return [...adapter.launchArgs, adapter.hookInjection.flag, file];
}

export function createWorkStarter(options: WorkStarterOptions): WorkStarter {
  const { terminals, runner, env, launcherDir, hooksDir, dryland, autoCommit, pretype = PRETYPE_TIMING } = options;
  const started: SessionInfo[] = [];

  function adapterFor(agentId: string): AgentAdapter {
    const adapter = AGENT_ADAPTERS.find((a) => a.id === agentId);
    if (adapter === undefined) {
      throw new DrylandError(`There is no Agent CLI "${agentId}".`, "Pick one of the Agent CLIs offered.");
    }
    return adapter;
  }

  /**
   * The session's environment: the inherited one less any parent session's markers, the launcher first on `PATH`,
   * and the session's identity.
   */
  function sessionEnv(adapter: AgentAdapter, sessionId: string, paneKey: string): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
      if (value !== undefined && !adapter.parentSessionEnv.includes(key)) result[key] = value;
    }
    const pathKey = envKey(env, "PATH");
    result[pathKey] = [launcherDir, env[pathKey]].filter((dir) => dir !== undefined && dir !== "").join(delimiter);
    return { ...result, DRYLAND_SESSION_ID: sessionId, DRYLAND_PANE_KEY: paneKey };
  }

  return {
    async listAgents() {
      return Promise.all(
        AGENT_ADAPTERS.map(async ({ id, name, binary }) => {
          const available = (await findExecutable(binary, env)) !== null;
          return { id, name, available, reason: available ? null : `\`${binary}\` is not on PATH.` };
        }),
      );
    },

    async startWork(projectPath, ticket, agentId) {
      const adapter = adapterFor(agentId);
      const executable = await findExecutable(adapter.binary, env);
      if (executable === null) {
        throw new DrylandError(
          `${adapter.name} is not installed: \`${adapter.binary}\` is not on PATH.`,
          `Install ${adapter.name}, then start work again.`,
        );
      }
      const mainCheckout = await findMainCheckout(runner, projectPath);
      const worktree = await worktreeForTicket(runner, mainCheckout, `${ticket.map}/${ticket.id}`);
      const tickets = await readTickets(mainCheckout);
      const command = commandForTicket(nextSteps(await readRepoSnapshot(runner, mainCheckout, tickets)), ticket);
      const typed = command === null ? null : skillCommand(adapter, command);

      const sessionId = randomUUID();
      // After the command is chosen, which reads the ticket unclaimed, and before the agent starts, so it finds the
      // claim made. Never released or taken over here: a claim someone else holds stays theirs.
      const claim = await dryland.run(trackerArgs({ kind: "claim", ticket }, autoCommit(projectPath)), {
        cwd: mainCheckout,
        sessionId,
      });
      const warnings = claim.ok ? claim.warnings : [`${claim.message} The session started without claiming it.`];
      let terminalId = "";
      const pretyper =
        typed === null
          ? undefined
          : createPretyper({
              text: typed,
              write: (key) => terminals.write(terminalId, key),
              blocks: (output) => blocksInput(adapter, output),
              timing: pretype,
            });
      terminalId = terminals.open({
        cwd: worktree.path,
        program: programFor(executable, launchArgs(adapter, hooksDir), env),
        env: (id) => sessionEnv(adapter, sessionId, id),
        onOutput: pretyper,
      });
      const session: SessionInfo = {
        id: sessionId,
        terminalId,
        agent: { id: adapter.id, name: adapter.name },
        ticket: { map: ticket.map, id: ticket.id },
        worktree: { branch: worktree.branch, path: worktree.path },
        command: typed,
        startedAt: new Date().toISOString(),
      };
      started.push(session);
      return { session, warnings };
    },

    sessions: () => [...started],
  };
}
