import { randomUUID } from "node:crypto";
import { delimiter } from "node:path";
import {
  AGENT_ADAPTERS,
  type AgentAdapter,
  blocksInput,
  commandForTicket,
  createWorktree,
  DrylandError,
  envKey,
  findExecutable,
  findMainCheckout,
  launchArgs,
  installedSkills,
  nextSteps,
  programFor,
  type LiveEvent,
  type ProcessRunner,
  readRepoSnapshot,
  readSessionIndex,
  readTickets,
  recordSession,
  resumeArgs,
  sessionExists,
  sessionIdArgs,
  sessionsOf,
  type TicketRef,
  skillCommand,
  worktreeForScratch,
  worktreeAt,
  worktreeForTicket,
} from "@dryland/core";
import type { AgentAvailability, SessionInfo } from "../shared/api.ts";
import { trackerArgs } from "../shared/tracker-actions.ts";
import {
  chosenSkillCommand,
  MAP_WORKTREE_SLUG,
  NEW_MAP_EFFORT,
  SCRATCH_EFFORT,
  SCRATCH_SLUG,
  type WorkTarget,
} from "../shared/work-target.ts";
import type { DrylandCli } from "./dryland-cli.ts";
import { createPretyper, PRETYPE_TIMING, type PretypeTiming } from "./pretype.ts";
import { sessionItem } from "./session-recording.ts";
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
  /** Runs `dryland`, through which the ticket is claimed for its worktree branch. */
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
  /** The skills the Agent CLI has installed for the project, by name. */
  listSkills(projectPath: string, agentId: string): Promise<string[]>;
  /**
   * Opens the Agent CLI with a command typed but not submitted. On a ticket: in its worktree, created or reused,
   * with its next-step command, and the ticket is claimed for the worktree's branch; a ticket someone else holds keeps its
   * claim and the session starts anyway. On a map: in its `<map>/scratch-wayfinder` worktree, created or reused,
   * with `/wayfinder <map>`. On a new map: in a new temporary worktree with `/wayfinder `, so the skill, not
   * Dryland, writes the map. With `skill`, that installed skill's command is typed instead. A CLI that takes a
   * session id is launched with a new one, recorded in the session index for the item before the spawn. Fails with
   * a `DrylandError`, before touching anything, when the CLI or the skill is not installed.
   */
  startWork(projectPath: string, target: WorkTarget, agentId: string, skill?: string | null): Promise<StartedWork>;
  /**
   * Continues the newest session the index holds for the ticket, in the ticket's worktree: the CLI is launched with
   * resume-by-id, hooks injected and nothing typed, and the claim is not touched. When the CLI no longer has the
   * session, or with `mode` "pick", it opens its own picker instead; the first comes with a warning saying why.
   * Fails with a `DrylandError`, before launching anything, when the ticket has no indexed session, its CLI
   * cannot resume, or a session of it is already running.
   */
  resumeSession(projectPath: string, ticket: TicketRef, mode: "resume" | "pick"): Promise<StartedWork>;
  /**
   * Opens a plain terminal in `cwd` where an Agent CLI typed by hand reports like a session: the launcher's shims
   * on `PATH`, and the terminal's own id as `DRYLAND_PANE_KEY`. Returns the terminal's id.
   */
  openShell(cwd: string): string;
  /**
   * Takes the CLI that sent `event` for a session of its own, when it was started by hand in a terminal opened by
   * `openShell` that still runs: linked by its working directory to the ticket of the Dryland-created worktree it
   * runs in, or to none when the directory is not one (unlinked, or scratch work in a scratch worktree). Returns the
   * new session; `null` when the event is not from such a CLI or its session is already taken.
   */
  adoptManual(projectPath: string, event: LiveEvent): Promise<SessionInfo | null>;
  /** The sessions started so far, as recorded at spawn. */
  sessions(): SessionInfo[];
}

/** The user's home as the CLIs read it: `USERPROFILE` on Windows, `HOME` elsewhere; `null` when unset. */
function homeOf(env: Record<string, string | undefined>): string | null {
  const names = process.platform === "win32" ? ["USERPROFILE", "HOME"] : ["HOME"];
  for (const name of names) {
    const value = env[envKey(env, name)];
    if (value !== undefined && value !== "") return value;
  }
  return null;
}

/** The ticket reference of a `<map>/<id>` string. */
function refOf(ticket: string): TicketRef {
  const slash = ticket.lastIndexOf("/");
  return { map: ticket.slice(0, slash), id: ticket.slice(slash + 1) };
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

    listSkills: async (projectPath, agentId) =>
      installedSkills(adapterFor(agentId), await findMainCheckout(runner, projectPath), homeOf(env)),

    async startWork(projectPath, target, agentId, skill = null) {
      const adapter = adapterFor(agentId);
      const executable = await findExecutable(adapter.binary, env);
      if (executable === null) {
        throw new DrylandError(
          `${adapter.name} is not installed: \`${adapter.binary}\` is not on PATH.`,
          `Install ${adapter.name}, then start work again.`,
        );
      }
      const mainCheckout = await findMainCheckout(runner, projectPath);
      if (skill !== null && !(await installedSkills(adapter, mainCheckout, homeOf(env))).includes(skill)) {
        throw new DrylandError(
          `${adapter.name} has no skill "${skill}" installed for this project.`,
          "Pick one of the skills offered.",
        );
      }

      const sessionId = randomUUID();
      const warnings: string[] = [];
      let worktree: { branch: string; path: string };
      let command: string | null;
      if (target.kind === "ticket") {
        const { ticket } = target;
        worktree = await worktreeForTicket(runner, mainCheckout, `${ticket.map}/${ticket.id}`);
        const tickets = await readTickets(mainCheckout);
        command =
          skill !== null
            ? chosenSkillCommand(skill, target)
            : commandForTicket(nextSteps(await readRepoSnapshot(runner, mainCheckout, tickets)), ticket);
        // After the command is chosen, which reads the ticket unclaimed, and before the agent starts, so it finds
        // the claim made. Run in the worktree, so its branch holds the claim and the claim outlives the session.
        // Never released or taken over here: a claim someone else holds stays theirs.
        const claim = await dryland.run(trackerArgs({ kind: "claim", ticket }, autoCommit(projectPath)), {
          cwd: worktree.path,
          sessionId,
        });
        warnings.push(...(claim.ok ? claim.warnings : [`${claim.message} The session started without claiming it.`]));
      } else if (target.kind === "map") {
        worktree = await worktreeForScratch(runner, mainCheckout, target.map, MAP_WORKTREE_SLUG);
        command = skill !== null ? chosenSkillCommand(skill, target) : `/wayfinder ${target.map}`;
      } else if (target.kind === "scratch") {
        // Always a new worktree: each ticketless session is its own exploration.
        worktree = await createWorktree(runner, mainCheckout, { map: SCRATCH_EFFORT, slug: SCRATCH_SLUG });
        command = skill !== null ? chosenSkillCommand(skill, target) : null;
      } else {
        // Always a new worktree: each new map is its own exploration, named only once the skill has charted it.
        worktree = await createWorktree(runner, mainCheckout, { map: NEW_MAP_EFFORT, slug: MAP_WORKTREE_SLUG });
        command = skill !== null ? chosenSkillCommand(skill, target) : "/wayfinder ";
      }
      const typed = command === null ? null : skillCommand(adapter, command);
      const ticket = target.kind === "ticket" ? { map: target.ticket.map, id: target.ticket.id } : null;
      const map = target.kind === "ticket" ? target.ticket.map : target.kind === "map" ? target.map : null;
      // Dryland picks the CLI's session id and records it before the spawn, so the index knows it before any hook.
      const agentSessionId = adapter.sessionIdFlag === null ? null : randomUUID();
      if (agentSessionId !== null) {
        try {
          const item = sessionItem({ ticket, map, worktree });
          warnings.push(
            ...(await recordSession(runner, worktree.path, item, { adapter: adapter.id, sessionId: agentSessionId })),
          );
        } catch (error) {
          warnings.push(`The session was not recorded in the session index (${(error as Error).message}).`);
        }
      }
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
        program: programFor(
          executable,
          launchArgs(adapter, hooksDir, agentSessionId === null ? [] : sessionIdArgs(adapter, agentSessionId)),
          env,
        ),
        env: (id) => sessionEnv(adapter, sessionId, id),
        onOutput: pretyper,
      });
      const session: SessionInfo = {
        id: sessionId,
        terminalId,
        agent: { id: adapter.id, name: adapter.name },
        agentSessionId,
        project: projectPath,
        ticket,
        map,
        worktree: { branch: worktree.branch, path: worktree.path },
        command: typed,
        startedAt: new Date().toISOString(),
      };
      started.push(session);
      return { session, warnings };
    },

    async resumeSession(projectPath, ticket, mode) {
      const mainCheckout = await findMainCheckout(runner, projectPath);
      const item = `${ticket.map}/${ticket.id}`;
      const known = sessionsOf((await readSessionIndex(runner, mainCheckout)).index, item)[0];
      if (known === undefined) {
        throw new DrylandError(`${item} has no session to resume.`, "Start work on the ticket instead.");
      }
      const adapter = adapterFor(known.adapter);
      const executable = await findExecutable(adapter.binary, env);
      if (executable === null) {
        throw new DrylandError(
          `${adapter.name} is not installed: \`${adapter.binary}\` is not on PATH.`,
          `Install ${adapter.name}, then resume the session.`,
        );
      }
      // Resume all, resume on start and a restored tab can race: a ticket already running is not started twice.
      const running = new Set(terminals.liveIds());
      if (started.some((s) => running.has(s.terminalId) && s.ticket?.map === ticket.map && s.ticket.id === ticket.id)) {
        throw new DrylandError(`${item} already has a running session.`, "Show that session instead.");
      }
      if (resumeArgs(adapter, null) === null) {
        throw new DrylandError(`${adapter.name} cannot resume a session.`, "Start fresh instead.");
      }
      const worktree = await worktreeForTicket(runner, mainCheckout, item);
      const warnings: string[] = [];
      let agentSessionId: string | null = null;
      if (mode === "resume" && (await sessionExists(adapter, homeOf(env), worktree.path, known.sessionId))) {
        agentSessionId = known.sessionId;
        // The same id, seen now: its entry moves to the front and reads as live again.
        try {
          const recorded = { adapter: adapter.id, sessionId: known.sessionId };
          warnings.push(...(await recordSession(runner, worktree.path, item, recorded)));
        } catch (error) {
          warnings.push(`The session was not recorded in the session index (${(error as Error).message}).`);
        }
      } else if (mode === "resume") {
        warnings.push(
          `${adapter.name} no longer has the session ${known.sessionId}, so its own picker opens: pick a session to continue.`,
        );
      }
      const sessionId = randomUUID();
      const terminalId = terminals.open({
        cwd: worktree.path,
        program: programFor(executable, launchArgs(adapter, hooksDir, resumeArgs(adapter, agentSessionId) ?? []), env),
        env: (id) => sessionEnv(adapter, sessionId, id),
      });
      const session: SessionInfo = {
        id: sessionId,
        terminalId,
        agent: { id: adapter.id, name: adapter.name },
        agentSessionId,
        project: projectPath,
        ticket: { map: ticket.map, id: ticket.id },
        map: ticket.map,
        worktree: { branch: worktree.branch, path: worktree.path },
        command: null,
        startedAt: new Date().toISOString(),
      };
      started.push(session);
      return { session, warnings };
    },

    openShell: (cwd) =>
      terminals.open({
        cwd,
        env: (id) => {
          const pathKey = envKey(env, "PATH");
          const path = [launcherDir, env[pathKey]].filter((dir) => dir !== undefined && dir !== "").join(delimiter);
          const inherited = Object.fromEntries(
            Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined),
          );
          return { ...inherited, [pathKey]: path, DRYLAND_PANE_KEY: id, DRYLAND_HOOKS_DIR: hooksDir };
        },
      }),

    async adoptManual(projectPath, event) {
      const { agent, cwd, pane } = event;
      if (agent === undefined || cwd === undefined || pane === undefined) return null;
      const adapter = AGENT_ADAPTERS.find((a) => a.id === agent);
      if (adapter === undefined || !terminals.liveIds().includes(pane)) return null;
      if (started.some((s) => s.id === event.session_id)) return null;
      const entry = await worktreeAt(runner, await findMainCheckout(runner, projectPath), cwd);
      const branch = entry?.branch ?? "";
      const ticket = entry?.link.ticket == null ? null : refOf(entry.link.ticket);
      const effort = entry?.link.kind === "scratch" ? branch.slice(0, branch.indexOf("/")) : null;
      const session: SessionInfo = {
        id: event.session_id,
        terminalId: pane,
        agent: { id: adapter.id, name: adapter.name },
        agentSessionId: event.agent_session_id ?? null,
        project: projectPath,
        ticket,
        map: ticket?.map ?? (effort === null || effort === NEW_MAP_EFFORT || effort === SCRATCH_EFFORT ? null : effort),
        worktree: { branch, path: entry?.path ?? cwd },
        command: null,
        startedAt: new Date().toISOString(),
        manual: true,
      };
      // The shell outlives its CLI, so a CLI run again in it replaces the session it ended.
      for (let i = started.length - 1; i >= 0; i--) if (started[i]?.terminalId === pane) started.splice(i, 1);
      started.push(session);
      return session;
    },

    sessions: () => [...started],
  };
}
