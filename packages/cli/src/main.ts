import { randomUUID } from "node:crypto";
import {
  AGENT_ADAPTERS,
  blockTicket,
  branchHolder,
  claimTicket,
  commentOnTicket,
  compatPrompt,
  createTicket,
  copilotPaths,
  createWorktree,
  currentAgentSession,
  DrylandError,
  findExecutable,
  findMainCheckout,
  hookStateOf,
  indexMap,
  installAgentHooks,
  linkLauncher,
  isLiveEventKind,
  launchArgs,
  LIVE_EVENT_KINDS,
  listTickets,
  listWorktrees,
  mapFrontier,
  nodeProcessRunner,
  pruneWorktree,
  readSessionIndex,
  readSkillSetup,
  recordSession,
  retentionDaysFromEnv,
  releaseTicket,
  removeAgentHooks,
  resolveTicket,
  runDoctor,
  SESSION_STATE_EVENTS,
  sendLiveEvent,
  sessionsOf,
  showMap,
  showTicket,
  tickTicket,
  ticketKind,
  triageTicket,
  unlinkLauncher,
  untrustFolders,
  withoutPathDir,
  type DoctorReport,
  type IndexedSession,
  type LiveEvent,
  type LiveEventKind,
  type MapView,
  type Ticket,
  type TicketChangedPayload,
  type WorktreeEntry,
} from "@dryland/core";

function formatWorktrees(entries: WorktreeEntry[]): string {
  const label = (e: WorktreeEntry) => (e.main ? "(main checkout)" : (e.branch ?? "(detached)"));
  const link = (e: WorktreeEntry) => {
    if (e.main) return "-";
    if (e.link.kind === "scratch") return "scratch";
    if (e.link.kind === "unlinked") return "unlinked";
    return e.link.kind === "name" ? e.link.ticket : `${e.link.ticket} (trailer)`;
  };
  const width = Math.max(...entries.map((e) => label(e).length));
  const linkWidth = Math.max(...entries.map((e) => link(e).length));
  return entries.map((e) => `${label(e).padEnd(width)}  ${link(e).padEnd(linkWidth)}  ${e.path}\n`).join("");
}

function formatDoctor(report: DoctorReport): string {
  const width = Math.max(...report.checks.map((c) => c.id.length));
  const prefix = (ok: boolean) => `${ok ? "OK  " : "FAIL"}  `;
  const indent = " ".repeat(prefix(false).length + width);
  const lines = report.checks.flatMap((c) => [
    `${prefix(c.ok)}${c.id.padEnd(width)}  ${c.detail}`,
    ...(c.nextAction === null ? [] : [`${indent}Next: ${c.nextAction}`]),
  ]);
  return `${lines.join("\n")}\n`;
}

function formatTickets(tickets: Ticket[], empty = "No tickets."): string {
  if (tickets.length === 0) return `${empty}\n`;
  const columnWidth = (pick: (ticket: Ticket) => string) => Math.max(...tickets.map((ticket) => pick(ticket).length));
  const stateWidth = columnWidth((ticket) => ticket.state);
  const typeWidth = columnWidth((ticket) => ticket.type);
  return tickets
    .map((t) => `${t.map}/${t.id}  ${t.state.padEnd(stateWidth)}  ${t.type.padEnd(typeWidth)}  ${t.title}\n`)
    .join("");
}

function formatTicket(ticket: Ticket, sessions: IndexedSession[]): string {
  const t = ticket;
  const blockers = t.blockers === "unknown" ? "unknown" : t.blockers.length === 0 ? "none" : t.blockers.join(", ");
  const lines = [
    `${t.map}/${t.id}  ${t.title}`,
    `Type: ${t.type}`,
    `State: ${t.state}`,
    `Claimed by: ${t.claimant ?? "nobody"}`,
    `Blocked by: ${blockers}`,
    `Triage: ${t.triageRole ?? "none"}`,
  ];
  if (t.body !== "") lines.push("", t.body);
  if (t.answer !== null) lines.push("", "Answer:", t.answer);
  if (t.comments.length > 0) lines.push("", `Comments (${t.comments.length}):`, t.comments.join("\n\n"));
  if (sessions.length > 0) {
    lines.push(
      "",
      `Sessions (${sessions.length}):`,
      ...sessions.map(
        (s) => `  ${s.adapter}  ${s.sessionId}  last seen ${s.lastSeen}${s.lastState ? `  ${s.lastState}` : ""}`,
      ),
    );
  }
  return `${lines.join("\n")}\n`;
}

function formatMap(map: MapView): string {
  const lines = [`Map: ${map.title} (${map.name})`];
  if (map.destination !== "") lines.push("", `Destination: ${map.destination}`);
  const groups = [
    ["Planning", map.tickets.filter((t) => ticketKind(t) === "planning")],
    ["Implementation", map.tickets.filter((t) => ticketKind(t) === "implementation")],
  ] as const;
  for (const [name, tickets] of groups) {
    if (tickets.length > 0)
      lines.push(
        "",
        `${name}:`,
        ...formatTickets(tickets)
          .trimEnd()
          .split("\n")
          .map((l) => `  ${l}`),
      );
  }
  if (map.fog.length > 0) lines.push("", "Fog:", ...map.fog.map((item) => `  - ${item}`));
  return `${lines.join("\n")}\n`;
}

const USAGE = [
  "Usage: dryland ticket list [--json]",
  "       dryland ticket show <map>/<number> [--json]",
  "       dryland ticket claim <map>/<number> [--commit | --no-commit] [--json]",
  "       dryland ticket release <map>/<number> [--commit | --no-commit] [--json]",
  "       dryland ticket create --map <map> --title <title> --type <type> [--question <text>]",
  "                             [--blocked-by <number>[,<number>...]] [--status <role>] [--commit | --no-commit] [--json]",
  "       dryland ticket resolve <map>/<number> --answer <text> [--amend] [--commit | --no-commit] [--json]",
  "       dryland ticket tick <map>/<number> --criterion <n> [--commit | --no-commit] [--json]",
  "       dryland ticket block <map>/<number> [--add <number>[,<number>...]] [--remove <number>[,<number>...]]",
  "                            [--commit | --no-commit] [--json]",
  "       dryland ticket comment <map>/<number> --text <text> [--commit | --no-commit] [--json]",
  "       dryland ticket triage <map>/<number> --role <role> [--commit | --no-commit] [--json]",
  "       dryland map show <map> [--json]",
  "       dryland map frontier <map> [--json]",
  "       dryland map index <map> --title <title> --link <path> --gist <text> [--commit | --no-commit] [--json]",
  "       dryland worktree create [<map>/<number>] [--map <map>] [--slug <slug>] [--json]",
  "       dryland worktree list [--json]",
  "       dryland worktree prune <branch> [--yes] [--session-attached] [--json]",
  "       dryland status <kind> [--session <id>] [--payload <json>] [--json]",
  "       dryland doctor [--install-hooks | --remove-hooks | --link-path | --unlink-path | --compat-prompt] [--json]",
  "",
].join("\n");

interface Output {
  value: unknown;
  text: string;
  /** Written to stderr; the command still succeeded. */
  warnings?: string[];
  /** Overrides the exit code of 0; the output is still written. */
  exitCode?: number;
}

interface Flags {
  /** `true` with `--commit`, `false` with `--no-commit`, `undefined` to let git's `dryland.autoCommit` decide. */
  commit: boolean | undefined;
  /** Command-specific switches given, by name without the leading `--`. */
  switches: Set<string>;
  /** Options that take a value, by name without the leading `--`. */
  values: Record<string, string>;
}

/** The value of `--name`, or an error naming the flag that is missing. */
function required(flags: Flags, name: string): string {
  const value = flags.values[name];
  if (value === undefined) {
    throw new DrylandError(`--${name} is required.`, `Add --${name} <value>; run \`dryland\` for usage.`);
  }
  return value;
}

/** The numbers of a comma-separated list option; `undefined` when the option was not given. */
function numberList(flags: Flags, name: string): string[] | undefined {
  return flags.values[name]
    ?.split(",")
    .map((number) => number.trim())
    .filter((number) => number !== "");
}

/** The JSON of `--payload`; `undefined` when it was not given. */
function parsePayload(text: string | undefined): unknown {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new DrylandError("--payload is not valid JSON.", `Pass a JSON value, such as --payload '{"reason":"..."}'.`);
  }
}

/**
 * Tells the running app about `kind`, for the session in `DRYLAND_SESSION_ID` unless `session` names one, with the
 * Agent CLI's own session id when the CLI set one. Fire-and-forget: with no app running, or one that does not
 * answer, nothing happens.
 */
function reportLiveEvent(
  kind: LiveEventKind,
  payload?: unknown,
  session?: string,
  agentSessionId?: string,
): Promise<boolean> {
  const agentSession = currentAgentSession(AGENT_ADAPTERS, process.env)?.sessionId ?? agentSessionId;
  const event: LiveEvent = {
    session_id: session ?? process.env["DRYLAND_SESSION_ID"] ?? "",
    kind,
    timestamp: new Date().toISOString(),
    ...(agentSession === undefined ? {} : { agent_session_id: agentSession }),
    // A CLI started by hand through the launcher's shim: the app links it to a worktree by where it runs.
    ...(process.env["DRYLAND_AGENT"] === undefined
      ? {}
      : { agent: process.env["DRYLAND_AGENT"], cwd: process.cwd(), pane: process.env["DRYLAND_PANE_KEY"] }),
  };
  return sendLiveEvent(payload === undefined ? event : { ...event, payload });
}

/** What a command that returns the changed ticket changed. */
const changedTicket = (value: unknown): Omit<TicketChangedPayload, "command"> => {
  const ticket = value as Ticket;
  return { ticket: `${ticket.map}/${ticket.id}` };
};

/**
 * Records the Agent CLI session this command runs in, if any, against `ticket` in the session index. The index is a
 * cache, so a failure to write it is a warning: the ticket change has already been made.
 */
async function recordAgentSession(ticket: string): Promise<string[]> {
  const session = currentAgentSession(AGENT_ADAPTERS, process.env);
  if (session === null) return [];
  try {
    return await recordSession(nodeProcessRunner, process.cwd(), ticket, session, {
      retentionDays: retentionDaysFromEnv(process.env),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return [`The session was not recorded in the session index (${reason}).`];
  }
}

/** Whether to commit: `--commit` or `--no-commit` when given, so the app's setting wins; otherwise git's `dryland.autoCommit` decides. */
const autoCommit = (flags: Flags) => flags.commit;

/** Every command: whether it takes a target (a ticket or map), and what it prints. */
const COMMANDS: Record<
  string,
  {
    /** Whether it takes a target; `"optional"` allows one or none. */
    target: boolean | "optional";
    /** The switches (flags without a value, no `--`) the command accepts. */
    switches?: string[];
    /** The value options (without `--`) the command accepts; any other is refused rather than ignored. */
    options?: string[];
    /**
     * Set on commands that change tickets or maps: what changed, from the command's value and target. After the
     * command succeeds the app is told with a `ticket.changed` live event, whatever the tracker backend.
     */
    changed?: (value: unknown, target: string) => Omit<TicketChangedPayload, "command">;
    /** Set on commands that act on one ticket: run inside an Agent CLI session, that session is recorded on it. */
    recordsSession?: true;
    run: (target: string, flags: Flags) => Promise<Output>;
  }
> = {
  "ticket list": {
    target: false,
    run: async () => {
      const tickets = await listTickets(nodeProcessRunner, process.cwd());
      return { value: tickets, text: formatTickets(tickets) };
    },
  },
  "ticket show": {
    target: true,
    run: async (target) => {
      const ticket = await showTicket(nodeProcessRunner, process.cwd(), target);
      const { index, warnings } = await readSessionIndex(nodeProcessRunner, process.cwd());
      const sessions = sessionsOf(index, `${ticket.map}/${ticket.id}`);
      return { value: { ...ticket, sessions }, text: formatTicket(ticket, sessions), warnings };
    },
  },
  "ticket claim": {
    target: true,
    changed: changedTicket,
    recordsSession: true,
    run: async (target, flags) => {
      // Always the branch, even inside a Dryland session: a claim outlives its session (ADR 0010).
      const holder = await branchHolder(nodeProcessRunner, process.cwd());
      const { ticket, warnings, alreadyHeld } = await claimTicket(nodeProcessRunner, process.cwd(), target, {
        holder,
        autoCommit: autoCommit(flags),
      });
      const name = `${ticket.map}/${ticket.id}`;
      // On GitHub the claimant is the `gh` login, not the branch.
      const claimant = ticket.claimant ?? holder;
      const text = alreadyHeld ? `${claimant} already holds ${name}.\n` : `Claimed ${name} for ${claimant}.\n`;
      return { value: ticket, text, warnings };
    },
  },
  "ticket release": {
    target: true,
    changed: changedTicket,
    recordsSession: true,
    run: async (target, flags) => {
      const { ticket, warnings } = await releaseTicket(nodeProcessRunner, process.cwd(), target, {
        autoCommit: autoCommit(flags),
      });
      return { value: ticket, text: `Released ${ticket.map}/${ticket.id}.\n`, warnings };
    },
  },
  "ticket create": {
    target: false,
    changed: changedTicket,
    options: ["map", "title", "type", "question", "blocked-by", "status"],
    run: async (_target, flags) => {
      const { ticket, warnings } = await createTicket(
        nodeProcessRunner,
        process.cwd(),
        {
          map: required(flags, "map"),
          title: required(flags, "title"),
          type: required(flags, "type"),
          question: flags.values["question"],
          status: flags.values["status"],
          blockedBy: flags.values["blocked-by"]
            ?.split(",")
            .map((number) => number.trim())
            .filter((number) => number !== ""),
        },
        { autoCommit: autoCommit(flags) },
      );
      return { value: ticket, text: `Created ${ticket.map}/${ticket.id}: ${ticket.title}\n`, warnings };
    },
  },
  "ticket resolve": {
    target: true,
    changed: changedTicket,
    recordsSession: true,
    options: ["answer"],
    switches: ["amend"],
    run: async (target, flags) => {
      const amend = flags.switches.has("amend");
      const { ticket, warnings } = await resolveTicket(
        nodeProcessRunner,
        process.cwd(),
        target,
        required(flags, "answer"),
        { autoCommit: autoCommit(flags), amend },
      );
      const verb = amend ? "Amended the answer of" : "Resolved";
      return { value: ticket, text: `${verb} ${ticket.map}/${ticket.id}.\n`, warnings };
    },
  },
  "ticket tick": {
    target: true,
    changed: changedTicket,
    recordsSession: true,
    options: ["criterion"],
    run: async (target, flags) => {
      const criterion = Number(required(flags, "criterion"));
      const { ticket, warnings } = await tickTicket(nodeProcessRunner, process.cwd(), target, criterion, {
        autoCommit: autoCommit(flags),
      });
      return { value: ticket, text: `Ticked criterion ${criterion} of ${ticket.map}/${ticket.id}.\n`, warnings };
    },
  },
  "ticket block": {
    target: true,
    changed: changedTicket,
    recordsSession: true,
    options: ["add", "remove"],
    run: async (target, flags) => {
      const { ticket, warnings } = await blockTicket(
        nodeProcessRunner,
        process.cwd(),
        target,
        { add: numberList(flags, "add"), remove: numberList(flags, "remove") },
        { autoCommit: autoCommit(flags) },
      );
      const ids = ticket.blockers === "unknown" ? [] : ticket.blockers;
      const blockers = ids.length === 0 ? "none" : ids.join(", ");
      return { value: ticket, text: `${ticket.map}/${ticket.id} is now blocked by: ${blockers}.\n`, warnings };
    },
  },
  "ticket comment": {
    target: true,
    changed: changedTicket,
    recordsSession: true,
    options: ["text"],
    run: async (target, flags) => {
      const { ticket, warnings } = await commentOnTicket(
        nodeProcessRunner,
        process.cwd(),
        target,
        required(flags, "text"),
        { autoCommit: autoCommit(flags) },
      );
      return { value: ticket, text: `Commented on ${ticket.map}/${ticket.id}.\n`, warnings };
    },
  },
  "ticket triage": {
    target: true,
    changed: changedTicket,
    recordsSession: true,
    options: ["role"],
    run: async (target, flags) => {
      const { ticket, warnings } = await triageTicket(
        nodeProcessRunner,
        process.cwd(),
        target,
        required(flags, "role"),
        { autoCommit: autoCommit(flags) },
      );
      return { value: ticket, text: `Triaged ${ticket.map}/${ticket.id} as ${ticket.triageRole}.\n`, warnings };
    },
  },
  "map show": {
    target: true,
    run: async (target) => {
      const map = await showMap(nodeProcessRunner, process.cwd(), target);
      return { value: map, text: formatMap(map) };
    },
  },
  "map frontier": {
    target: true,
    run: async (target) => {
      const tickets = await mapFrontier(nodeProcessRunner, process.cwd(), target);
      return { value: tickets, text: formatTickets(tickets, "No frontier tickets.") };
    },
  },
  "map index": {
    target: true,
    changed: (_value, map) => ({ map }),
    options: ["title", "link", "gist"],
    run: async (target, flags) => {
      const { value, warnings } = await indexMap(
        nodeProcessRunner,
        process.cwd(),
        target,
        { title: required(flags, "title"), link: required(flags, "link"), gist: required(flags, "gist") },
        { autoCommit: autoCommit(flags) },
      );
      return { value, text: `Indexed "${flags.values["title"]}" in the ${target} map.\n`, warnings };
    },
  },
  status: {
    target: true,
    options: ["session", "payload"],
    run: async (kind, flags) => {
      if (!isLiveEventKind(kind)) {
        throw new DrylandError(`"${kind}" is not a live event kind.`, `Use one of: ${LIVE_EVENT_KINDS.join(", ")}.`);
      }
      const sent = await reportLiveEvent(kind, parsePayload(flags.values["payload"]), flags.values["session"]);
      return { value: { sent }, text: "" };
    },
  },
  doctor: {
    target: false,
    switches: ["install-hooks", "remove-hooks", "link-path", "unlink-path", "compat-prompt"],
    run: async (_target, flags) => {
      if (flags.switches.has("compat-prompt")) {
        const mainCheckout = await findMainCheckout(nodeProcessRunner, process.cwd());
        const prompt = compatPrompt(await readSkillSetup(mainCheckout));
        return { value: { prompt }, text: prompt };
      }
      const link = flags.switches.has("link-path");
      if (link && flags.switches.has("unlink-path")) {
        throw new DrylandError("--link-path and --unlink-path contradict each other.", "Pass one of them.");
      }
      if (link || flags.switches.has("unlink-path")) {
        const lines = link ? await linkLauncher({ launcher: process.env["DRYLAND_LAUNCHER"] }) : await unlinkLauncher();
        return { value: { lines }, text: lines.map((line) => `${line}\n`).join("") };
      }
      const install = flags.switches.has("install-hooks");
      if (install && flags.switches.has("remove-hooks")) {
        throw new DrylandError("--install-hooks and --remove-hooks contradict each other.", "Pass one of them.");
      }
      const changed =
        install || flags.switches.has("remove-hooks")
          ? await (install ? installAgentHooks : removeAgentHooks)(nodeProcessRunner, process.cwd())
          : { lines: [], warnings: [] };
      const report = await runDoctor(nodeProcessRunner, process.cwd());
      return {
        value: report,
        text: `${changed.lines.map((line) => `${line}\n`).join("")}${formatDoctor(report)}`,
        warnings: changed.warnings,
        exitCode: report.ok ? 0 : 1,
      };
    },
  },
  "worktree create": {
    target: "optional",
    options: ["map", "slug"],
    run: async (target, flags) => {
      const created = await createWorktree(nodeProcessRunner, process.cwd(), {
        ticket: target === "" ? undefined : target,
        map: flags.values["map"],
        slug: flags.values["slug"],
      });
      return { value: created, text: `Created worktree ${created.branch} at ${created.path}\n` };
    },
  },
  "worktree list": {
    target: false,
    run: async () => {
      const entries = await listWorktrees(nodeProcessRunner, process.cwd());
      return { value: entries, text: formatWorktrees(entries) };
    },
  },
  "worktree prune": {
    target: true,
    switches: ["yes", "session-attached"],
    run: async (target, flags) => {
      const pruned = await pruneWorktree(nodeProcessRunner, process.cwd(), target, {
        yes: flags.switches.has("yes"),
        sessionAttached: flags.switches.has("session-attached"),
      });
      // The worktree is gone, so Copilot has no use for its trust entry; a config that is not there is left alone.
      const untrusted = pruned.removed ? await untrustFolders(copilotPaths(), [pruned.path]) : null;
      const text = pruned.removed
        ? `Removed worktree ${pruned.path} and branch ${pruned.branch}.\n`
        : `Nothing was removed: pruning ${pruned.branch} needs confirmation.\n` +
          `Run again with --yes to remove worktree ${pruned.path} and branch ${pruned.branch}.\n`;
      return { value: pruned, text, warnings: untrusted?.warning === undefined ? [] : [untrusted.warning] };
    },
  },
};

/** Every value option some command takes, so its value is never mistaken for a target. */
const VALUE_OPTIONS = new Set(Object.values(COMMANDS).flatMap((command) => command.options ?? []));
const SWITCHES = new Set(Object.values(COMMANDS).flatMap((command) => command.switches ?? []));

/**
 * What the launcher's shim for the Agent CLI `id` needs to start it by hand the way a Dryland session starts, one
 * item per line: the real executable behind the shim, the id of the new session, and, where the CLI takes its status
 * hooks as a settings flag, that flag and its file. The shim runs the CLI itself, so the CLI keeps the terminal.
 */
async function prepareAgent(id: string | undefined): Promise<string> {
  const adapter = AGENT_ADAPTERS.find((a) => a.id === id);
  if (adapter === undefined) {
    throw new DrylandError(`There is no Agent CLI "${id ?? ""}".`, "Run the Agent CLI by its own name instead.");
  }
  const launcherDir = process.env["DRYLAND_LAUNCHER_DIR"];
  const executable = await findExecutable(
    adapter.binary,
    launcherDir === undefined ? process.env : withoutPathDir(process.env, launcherDir),
  );
  if (executable === null) {
    throw new DrylandError(
      `${adapter.name} is not installed: \`${adapter.binary}\` is not on PATH.`,
      `Install ${adapter.name}.`,
    );
  }
  const hooksDir = process.env["DRYLAND_HOOKS_DIR"];
  // Each run is a session of its own, named here since no Dryland launch named it.
  const lines = [executable, process.env["DRYLAND_SESSION_ID"] || randomUUID()];
  if (hooksDir !== undefined) lines.push(...launchArgs(adapter, hooksDir, []));
  return `${lines.join("\n")}\n`;
}

/** What the process has on stdin, or "" when nothing arrives soon: a hook must never hang its CLI. */
async function readStdin(timeoutMs = 1000): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  const read = (async () => {
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  })();
  await Promise.race([read, new Promise((resolve) => setTimeout(resolve, timeoutMs).unref())]);
  process.stdin.destroy();
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * The command a hook file of an Agent CLI without per-launch hook injection runs: reports the session state the
 * native `event` stands for, with the payload the CLI wrote to stdin. Does nothing outside a Dryland terminal, and
 * never fails, so it cannot break the CLI that runs it.
 */
async function agentHook(id: string | undefined, event: string | undefined): Promise<void> {
  const adapter = AGENT_ADAPTERS.find((a) => a.id === id);
  if (adapter === undefined || event === undefined || !process.env["DRYLAND_PANE_KEY"]) return;
  let payload: unknown;
  try {
    // PowerShell can pipe text with a byte order mark in front, which JSON.parse refuses.
    payload = JSON.parse((await readStdin()).replace(/^\u{FEFF}/u, ""));
  } catch {
    // No payload, or one that is not JSON: the event alone may still say enough.
  }
  const state = hookStateOf(adapter, event, payload);
  if (state === null) return;
  // The CLI's own session id is in the payload when it sets no variable for its hooks.
  const own =
    typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>)["sessionId"] : null;
  await reportLiveEvent(SESSION_STATE_EVENTS[state], undefined, undefined, typeof own === "string" ? own : undefined);
}

async function run(args: string[]): Promise<number> {
  if (args[0] === "agent-prepare") {
    process.stdout.write(await prepareAgent(args[1]));
    return 0;
  }
  if (args[0] === "agent-hook") {
    await agentHook(args[1], args[2]);
    return 0;
  }
  const json = args.includes("--json");
  if (args.includes("--commit") && args.includes("--no-commit")) {
    throw new DrylandError("--commit and --no-commit contradict each other.", "Pass one of them, or neither.");
  }
  const commit = args.includes("--commit") ? true : args.includes("--no-commit") ? false : undefined;
  const flags: Flags = { commit, switches: new Set(), values: {} };
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    const name = arg.startsWith("--") ? arg.slice(2) : "";
    if (VALUE_OPTIONS.has(name)) {
      const value = args[++i];
      if (value === undefined) throw new DrylandError(`--${name} needs a value.`, `Write it as --${name} <value>.`);
      flags.values[name] = value;
    } else if (SWITCHES.has(name)) {
      flags.switches.add(name);
    } else if (!["--json", "--commit", "--no-commit"].includes(arg)) {
      positional.push(arg);
    }
  }
  // A command is one word (`status`, `doctor`) or two (`ticket claim`); the next word is its target.
  const words = positional[0] !== undefined && COMMANDS[positional[0]] !== undefined ? 1 : 2;
  const commandName = positional.slice(0, words).join(" ");
  const target = positional[words];
  const entry = COMMANDS[commandName];

  if (entry !== undefined && (entry.target === "optional" || entry.target === (target !== undefined))) {
    const given = [
      ...Object.keys(flags.values).map((name) => [name, entry.options ?? []] as const),
      ...[...flags.switches].map((name) => [name, entry.switches ?? []] as const),
    ];
    for (const [option, accepted] of given) {
      if (!accepted.includes(option)) {
        throw new DrylandError(
          `--${option} is not an option of \`dryland ${commandName}\`.`,
          "Remove it, or run `dryland` with no arguments for usage.",
        );
      }
    }
    const { value, text, warnings = [], exitCode = 0 } = await entry.run(target ?? "", flags);
    if (entry.recordsSession) {
      const ticket = value as Ticket;
      warnings.push(...(await recordAgentSession(`${ticket.map}/${ticket.id}`)));
    }
    for (const warning of warnings) process.stderr.write(`dryland: warning: ${warning}\n`);
    process.stdout.write(json ? `${JSON.stringify(value, null, 2)}\n` : text);
    if (entry.changed !== undefined) {
      const payload: TicketChangedPayload = { command: commandName, ...entry.changed(value, target ?? "") };
      await reportLiveEvent("ticket.changed", payload);
    }
    return exitCode;
  }

  process.stderr.write(USAGE);
  return 2;
}

try {
  process.exitCode = await run(process.argv.slice(2));
} catch (error) {
  if (!(error instanceof DrylandError)) throw error;
  process.stderr.write(`dryland: ${error.message}\nNext: ${error.nextAction}\n`);
  process.exitCode = 1;
}
