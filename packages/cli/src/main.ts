import {
  AGENT_ADAPTERS,
  blockTicket,
  branchHolder,
  claimTicket,
  commentOnTicket,
  compatPrompt,
  createStoreMap,
  createStoreTicket,
  createTicket,
  copilotPaths,
  createWorktree,
  currentAgentSession,
  documentHelp,
  DrylandError,
  formatDiagnostic,
  findMainCheckout,
  hookStateOf,
  indexMap,
  initStore,
  installAgentHooks,
  isStoreInitialised,
  listStoreTickets,
  linkLauncher,
  isReportedState,
  listTickets,
  listWorktrees,
  MAP_INPUT,
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
  REPORTED_STATES,
  runDoctor,
  sendLiveEvent,
  sessionsOf,
  showMap,
  showStoreMap,
  showStoreTicket,
  showTicket,
  storeFrontier,
  TICKET_INPUT,
  tickTicket,
  ticketKind,
  triageTicket,
  unlinkLauncher,
  untrustFolders,
  type DoctorReport,
  type IndexedSession,
  type LiveEvent,
  mapGroups,
  type MapDocument,
  type MapView,
  type ReportedState,
  type Ticket,
  type TicketDocument,
  type WorktreeEntry,
  WriteFailure,
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

/** What a store map shows beyond a markdown map: notes, ticket lists read from state, and the out-of-scope items. */
interface StoreMapExtras {
  notes: string;
  /** Headed lists printed after the ticket groups. */
  lists: { heading: string; lines: string[] }[];
  outOfScope: string[];
}

function formatMap(map: MapView, extras?: StoreMapExtras): string {
  const lines = [`Map: ${map.title} (${map.name})`];
  if (map.destination !== "") lines.push("", `Destination: ${map.destination}`);
  if (extras !== undefined && extras.notes !== "") lines.push("", `Notes: ${extras.notes}`);
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
  for (const { heading, lines: items } of extras?.lists ?? []) lines.push("", `${heading}:`, ...items);
  if (map.fog.length > 0) lines.push("", "Fog:", ...map.fog.map((item) => `  - ${item}`));
  if (extras !== undefined && extras.outOfScope.length > 0) {
    lines.push("", "Out of scope:", ...extras.outOfScope.map((item) => `  - ${item}`));
  }
  return `${lines.join("\n")}\n`;
}

/** A ticket document as the ticket formatters take tickets. */
const asTicket = (d: TicketDocument): Ticket => ({
  id: d.id,
  map: d.effort,
  title: d.title,
  type: d.type,
  state: d.status,
  claimant: d.claim?.holder ?? null,
  blockers: d.blockedBy.map((ref) => ref.split("/")[1] ?? ref),
  triageRole: d.triageRole,
  body: d.report,
  answer: d.answer,
  comments: d.comments,
  raw: {},
});

function formatStoreTicket(d: TicketDocument, sessions: IndexedSession[]): string {
  const text = formatTicket(asTicket(d), sessions).trimEnd().split("\n");
  const extra = [
    ...(d.spec === null ? [] : [`Spec: ${d.spec}`]),
    ...(d.hitl ? ["Human in the loop: yes"] : []),
    ...(d.criteria.length === 0
      ? []
      : ["Criteria:", ...d.criteria.map((c) => `  - [${c.done ? "x" : " "}] ${c.text}`)]),
  ];
  text.splice(text.findIndex((line) => line.startsWith("Triage: ")) + 1, 0, ...extra);
  return `${text.join("\n")}\n`;
}

function formatStoreMap(d: MapDocument): string {
  const view = {
    name: d.effort,
    title: d.map?.title ?? d.effort,
    destination: d.map?.destination ?? "",
    fog: d.map?.fog ?? [],
    decisions: d.decisions,
    sections: [],
    tickets: d.tickets.map(asTicket),
  };
  const tickets = view.tickets;
  const groups = mapGroups(tickets);
  const list = (heading: string, items: Ticket[], detail: (t: Ticket) => string = () => ""): StoreMapExtras["lists"] =>
    items.length === 0
      ? []
      : [
          {
            heading,
            lines: formatTickets(items)
              .trimEnd()
              .split("\n")
              .map((l, i) => `  ${l}${detail(items[i] as Ticket)}`),
          },
        ];
  return formatMap(view, {
    notes: d.map?.notes ?? "",
    lists: [
      ...list("Frontier", groups.frontier),
      ...list(
        "Blocked",
        groups.blocked.map((b) => b.ticket),
        (t) => `  (waits for ${groups.blocked.find((b) => b.ticket === t)?.waitsFor.join(", ")})`,
      ),
      ...list("Claimed", groups.claimed, (t) => `  (${t.claimant ?? "unknown"})`),
      ...(d.decisions.length === 0
        ? []
        : [{ heading: "Decisions so far", lines: d.decisions.map((item) => `  - ${item}`) }]),
    ],
    outOfScope: d.map?.outOfScope ?? [],
  });
}

const USAGE = [
  "Usage: dryland init [--bind <repo id> | --new-store] [--json]",
  "       dryland ticket list [--text] [--json]",
  "       dryland ticket show <map>/<number> [--text] [--json]",
  "       dryland ticket claim <map>/<number> [--commit | --no-commit] [--json]",
  "       dryland ticket release <map>/<number> [--commit | --no-commit] [--json]",
  "       dryland ticket create [--check] [--help]   (state store: a JSON document on stdin)",
  "       dryland ticket create --map <map> --title <title> --type <type> [--question <text>]",
  "                             [--blocked-by <number>[,<number>...]] [--status <role>] [--commit | --no-commit] [--json]",
  "       dryland ticket resolve <map>/<number> --answer <text> [--amend] [--commit | --no-commit] [--json]",
  "       dryland ticket tick <map>/<number> --criterion <n> [--commit | --no-commit] [--json]",
  "       dryland ticket block <map>/<number> [--add <number>[,<number>...]] [--remove <number>[,<number>...]]",
  "                            [--commit | --no-commit] [--json]",
  "       dryland ticket comment <map>/<number> --text <text> [--commit | --no-commit] [--json]",
  "       dryland ticket triage <map>/<number> --role <role> [--commit | --no-commit] [--json]",
  "       dryland map create [--check] [--help]   (state store: a JSON document on stdin)",
  "       dryland map show <map> [--text] [--json]",
  "       dryland map frontier <map> [--text] [--json]",
  "       dryland map index <map> --title <title> --link <path> --gist <text> [--commit | --no-commit] [--json]",
  "                          (markdown only: a state store derives Decisions so far from resolved tickets)",
  "       dryland worktree create [<map>/<number>] [--map <map>] [--slug <slug>] [--json]",
  "       dryland worktree list [--json]",
  "       dryland worktree prune <branch> [--yes] [--session-attached] [--json]",
  "       dryland status <running|waiting|idle|ended> [--session <id>] [--json]",
  "       dryland doctor [--install-hooks | --remove-hooks | --link-path | --unlink-path | --compat-prompt] [--json]",
  "",
].join("\n");

interface Output {
  value: unknown;
  /** A read of the state store: printed as its document unless `--text` asks for the rendering. */
  structured?: true;
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

/**
 * Tells the running app the session in `DRYLAND_SESSION_ID` (unless `session` names one) is in `state`, with the
 * Agent CLI's own session id when the CLI set one. Fire-and-forget: with no app running, or one that does not
 * answer, nothing happens.
 */
function reportSessionState(state: ReportedState, session?: string, agentSessionId?: string): Promise<boolean> {
  const agentSession = currentAgentSession(AGENT_ADAPTERS, process.env)?.sessionId ?? agentSessionId;
  const event: LiveEvent = {
    session_id: session ?? process.env["DRYLAND_SESSION_ID"] ?? "",
    state,
    timestamp: new Date().toISOString(),
    ...(agentSession === undefined ? {} : { agent_session_id: agentSession }),
  };
  return sendLiveEvent(event);
}

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

/** Whether this command runs inside an Agent CLI session, which makes an agent its author. */
const callerAuthor = (): "human" | "agent" =>
  currentAgentSession(AGENT_ADAPTERS, process.env) !== null || !!process.env["DRYLAND_SESSION_ID"] ? "agent" : "human";

/** The document on stdin for a write command. */
const readDocument = (): Promise<string> => readStdin(5000);

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
    /** Printed by `--help`: the usage and the schema of the document the command reads. */
    help?: string;
    /** Set on commands that act on one ticket: run inside an Agent CLI session, that session is recorded on it. */
    recordsSession?: true;
    run: (target: string, flags: Flags) => Promise<Output>;
  }
> = {
  init: {
    target: false,
    options: ["bind"],
    switches: ["new-store"],
    run: async (_target, flags) => {
      const { created } = await initStore(process.cwd(), {
        bind: flags.values["bind"],
        newStore: flags.switches.has("new-store"),
      });
      return {
        value: { created },
        text: created ? "Created the Dryland state store.\n" : "The Dryland state store already exists.\n",
      };
    },
  },
  "ticket list": {
    target: false,
    run: async () => {
      if (await isStoreInitialised(process.cwd())) {
        const list = await listStoreTickets(process.cwd());
        return { value: list, structured: true, text: formatTickets(list.tickets.map(asTicket)) };
      }
      const tickets = await listTickets(nodeProcessRunner, process.cwd());
      return { value: tickets, text: formatTickets(tickets) };
    },
  },
  "ticket show": {
    target: true,
    run: async (target) => {
      if (await isStoreInitialised(process.cwd())) {
        const document = await showStoreTicket(process.cwd(), target);
        const { index, warnings } = await readSessionIndex(nodeProcessRunner, process.cwd());
        const sessions = sessionsOf(index, document.ref);
        return {
          value: { ...document, sessions },
          structured: true,
          text: formatStoreTicket(document, sessions),
          warnings,
        };
      }
      const ticket = await showTicket(nodeProcessRunner, process.cwd(), target);
      const { index, warnings } = await readSessionIndex(nodeProcessRunner, process.cwd());
      const sessions = sessionsOf(index, `${ticket.map}/${ticket.id}`);
      return { value: { ...ticket, sessions }, text: formatTicket(ticket, sessions), warnings };
    },
  },
  "ticket claim": {
    target: true,
    recordsSession: true,
    run: async (target, flags) => {
      // Always the branch, even inside a Dryland session: a claim outlives its session (ADR 0010).
      const holder = await branchHolder(nodeProcessRunner, process.cwd());
      const { ticket, warnings, alreadyHeld } = await claimTicket(nodeProcessRunner, process.cwd(), target, {
        holder,
        session:
          process.env["DRYLAND_SESSION_ID"] ?? currentAgentSession(AGENT_ADAPTERS, process.env)?.sessionId ?? null,
        autoCommit: autoCommit(flags),
        author: callerAuthor(),
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
    recordsSession: true,
    run: async (target, flags) => {
      const { ticket, warnings } = await releaseTicket(nodeProcessRunner, process.cwd(), target, {
        autoCommit: autoCommit(flags),
        author: callerAuthor(),
      });
      return { value: ticket, text: `Released ${ticket.map}/${ticket.id}.\n`, warnings };
    },
  },
  "ticket create": {
    target: false,
    options: ["map", "title", "type", "question", "blocked-by", "status"],
    switches: ["check"],
    help: documentHelp("dryland ticket create [--check] [--json] < ticket.json", TICKET_INPUT),
    run: async (_target, flags) => {
      if (await isStoreInitialised(process.cwd())) {
        const flagged = Object.keys(flags.values).filter((name) => name !== "text");
        if (flagged.length > 0) {
          throw new DrylandError(
            `--${flagged[0]} is not an option of \`dryland ticket create\` in a repo with a state store.`,
            "Pipe one JSON document to the command instead; run it with --help for the fields and an example.",
          );
        }
        const { ticket, written } = await createStoreTicket(process.cwd(), await readDocument(), {
          author: callerAuthor(),
          checkOnly: flags.switches.has("check"),
        });
        const ref = `${ticket.effort}/${ticket.id}`;
        return {
          value: { ref, written, ticket },
          text: written ? `Created ${ref}: ${ticket.title}\n` : `Checked: this would create ${ref}.\n`,
        };
      }
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
        { autoCommit: autoCommit(flags), amend, author: callerAuthor() },
      );
      const verb = amend ? "Amended the answer of" : "Resolved";
      return { value: ticket, text: `${verb} ${ticket.map}/${ticket.id}.\n`, warnings };
    },
  },
  "ticket tick": {
    target: true,
    recordsSession: true,
    options: ["criterion"],
    run: async (target, flags) => {
      const criterion = Number(required(flags, "criterion"));
      const { ticket, warnings } = await tickTicket(nodeProcessRunner, process.cwd(), target, criterion, {
        autoCommit: autoCommit(flags),
        author: callerAuthor(),
      });
      return { value: ticket, text: `Ticked criterion ${criterion} of ${ticket.map}/${ticket.id}.\n`, warnings };
    },
  },
  "ticket block": {
    target: true,
    recordsSession: true,
    options: ["add", "remove"],
    run: async (target, flags) => {
      const { ticket, warnings } = await blockTicket(
        nodeProcessRunner,
        process.cwd(),
        target,
        { add: numberList(flags, "add"), remove: numberList(flags, "remove") },
        { autoCommit: autoCommit(flags), author: callerAuthor() },
      );
      const ids = ticket.blockers === "unknown" ? [] : ticket.blockers;
      const blockers = ids.length === 0 ? "none" : ids.join(", ");
      return { value: ticket, text: `${ticket.map}/${ticket.id} is now blocked by: ${blockers}.\n`, warnings };
    },
  },
  "ticket comment": {
    target: true,
    recordsSession: true,
    options: ["text"],
    run: async (target, flags) => {
      const { ticket, warnings } = await commentOnTicket(
        nodeProcessRunner,
        process.cwd(),
        target,
        required(flags, "text"),
        { autoCommit: autoCommit(flags), author: callerAuthor() },
      );
      return { value: ticket, text: `Commented on ${ticket.map}/${ticket.id}.\n`, warnings };
    },
  },
  "ticket triage": {
    target: true,
    recordsSession: true,
    options: ["role"],
    run: async (target, flags) => {
      const { ticket, warnings } = await triageTicket(
        nodeProcessRunner,
        process.cwd(),
        target,
        required(flags, "role"),
        { autoCommit: autoCommit(flags), author: callerAuthor() },
      );
      return { value: ticket, text: `Triaged ${ticket.map}/${ticket.id} as ${ticket.triageRole}.\n`, warnings };
    },
  },
  "map create": {
    target: false,
    switches: ["check"],
    help: documentHelp("dryland map create [--check] [--json] < map.json", MAP_INPUT),
    run: async (_target, flags) => {
      const { map, written } = await createStoreMap(process.cwd(), await readDocument(), {
        author: callerAuthor(),
        checkOnly: flags.switches.has("check"),
      });
      return {
        value: { effort: map.effort, written, map },
        text: written
          ? `Created the map of ${map.effort}: ${map.title}\n`
          : `Checked: this would create the map of ${map.effort}.\n`,
      };
    },
  },
  "map show": {
    target: true,
    run: async (target) => {
      if (await isStoreInitialised(process.cwd())) {
        const document = await showStoreMap(process.cwd(), target);
        return { value: document, structured: true, text: formatStoreMap(document) };
      }
      const map = await showMap(nodeProcessRunner, process.cwd(), target);
      return { value: map, text: formatMap(map) };
    },
  },
  "map frontier": {
    target: true,
    run: async (target) => {
      if (await isStoreInitialised(process.cwd())) {
        const document = await storeFrontier(process.cwd(), target);
        const tickets = document.tickets.map(asTicket);
        return { value: document, structured: true, text: formatTickets(tickets, "No frontier tickets.") };
      }
      const tickets = await mapFrontier(nodeProcessRunner, process.cwd(), target);
      return { value: tickets, text: formatTickets(tickets, "No frontier tickets.") };
    },
  },
  "map index": {
    target: true,
    options: ["title", "link", "gist"],
    run: async (target, flags) => {
      if (await isStoreInitialised(process.cwd())) {
        throw new DrylandError(
          "`dryland map index` does nothing in a repo with a state store: Decisions so far is derived from the resolved tickets.",
          `Resolve the ticket with \`dryland ticket resolve ${target === "" ? "<map>/<number>" : `${target}/<number>`} --answer <text>\`; its title and the first sentence of its answer appear in \`dryland map show ${target}\`.`,
        );
      }
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
    options: ["session"],
    run: async (state, flags) => {
      if (!isReportedState(state)) {
        throw new DrylandError(`"${state}" is not a session state.`, `Use one of: ${REPORTED_STATES.join(", ")}.`);
      }
      const sent = await reportSessionState(state, flags.values["session"]);
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
  await reportSessionState(state, undefined, typeof own === "string" ? own : undefined);
}

async function run(args: string[]): Promise<number> {
  if (args[0] === "agent-hook") {
    await agentHook(args[1], args[2]);
    return 0;
  }
  const json = args.includes("--json");
  const asText = args.includes("--text");
  if (args.includes("--commit") && args.includes("--no-commit")) {
    throw new DrylandError("--commit and --no-commit contradict each other.", "Pass one of them, or neither.");
  }
  const commit = args.includes("--commit") ? true : args.includes("--no-commit") ? false : undefined;
  const flags: Flags = { commit, switches: new Set(), values: {} };
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    const name = arg.startsWith("--") ? arg.slice(2) : "";
    // `--text` renders a read for people; only `ticket comment` (replaced by a typed log entry in ticket 17) takes it as a value.
    const isRendering = name === "text" && !(args[0] === "ticket" && args[1] === "comment");
    if (VALUE_OPTIONS.has(name) && !isRendering) {
      const value = args[++i];
      if (value === undefined) throw new DrylandError(`--${name} needs a value.`, `Write it as --${name} <value>.`);
      flags.values[name] = value;
    } else if (SWITCHES.has(name)) {
      flags.switches.add(name);
    } else if (!["--json", "--text", "--help", "--commit", "--no-commit"].includes(arg)) {
      positional.push(arg);
    }
  }
  // A command is one word (`status`, `doctor`) or two (`ticket claim`); the next word is its target.
  const words = positional[0] !== undefined && COMMANDS[positional[0]] !== undefined ? 1 : 2;
  const commandName = positional.slice(0, words).join(" ");
  const target = positional[words];
  const entry = COMMANDS[commandName];

  if (args.includes("--help") && entry?.help !== undefined) {
    process.stdout.write(entry.help);
    return 0;
  }

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
    const { value, text, warnings = [], exitCode = 0, structured } = await entry.run(target ?? "", flags);
    if (entry.recordsSession) {
      const ticket = value as Ticket;
      warnings.push(...(await recordAgentSession(`${ticket.map}/${ticket.id}`)));
    }
    for (const warning of warnings) process.stderr.write(`dryland: warning: ${warning}\n`);
    process.stdout.write(json || (structured === true && !asText) ? `${JSON.stringify(value, null, 2)}\n` : text);
    return exitCode;
  }

  process.stderr.write(USAGE);
  return 2;
}

try {
  process.exitCode = await run(process.argv.slice(2));
} catch (error) {
  if (!(error instanceof DrylandError)) throw error;
  if (error instanceof WriteFailure) {
    for (const d of error.diagnostics) process.stderr.write(`${formatDiagnostic(d)}\n`);
    process.exitCode = error.exitCode;
  } else {
    process.exitCode = 1;
  }
  process.stderr.write(`dryland: ${error.message}\nNext: ${error.nextAction}\n`);
}
