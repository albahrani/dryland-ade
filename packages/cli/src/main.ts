import {
  branchHolder,
  claimTicket,
  createTicket,
  DrylandError,
  listTickets,
  mapFrontier,
  nodeProcessRunner,
  releaseTicket,
  resolveTicket,
  showMap,
  showTicket,
  ticketKind,
  type MapView,
  type Ticket,
} from "@dryland/core";

function formatTickets(tickets: Ticket[], empty = "No tickets."): string {
  if (tickets.length === 0) return `${empty}\n`;
  const columnWidth = (pick: (ticket: Ticket) => string) => Math.max(...tickets.map((ticket) => pick(ticket).length));
  const stateWidth = columnWidth((ticket) => ticket.state);
  const typeWidth = columnWidth((ticket) => ticket.type);
  return tickets
    .map((t) => `${t.map}/${t.id}  ${t.state.padEnd(stateWidth)}  ${t.type.padEnd(typeWidth)}  ${t.title}\n`)
    .join("");
}

function formatTicket(ticket: Ticket): string {
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
    if (tickets.length > 0) lines.push("", `${name}:`, ...formatTickets(tickets).trimEnd().split("\n").map((l) => `  ${l}`));
  }
  if (map.fog.length > 0) lines.push("", "Fog:", ...map.fog.map((item) => `  - ${item}`));
  return `${lines.join("\n")}\n`;
}

const USAGE = [
  "Usage: dryland ticket list [--json]",
  "       dryland ticket show <map>/<number> [--json]",
  "       dryland ticket claim <map>/<number> [--no-commit] [--json]",
  "       dryland ticket release <map>/<number> [--no-commit] [--json]",
  "       dryland ticket create --map <map> --title <title> --type <type> [--question <text>]",
  "                             [--blocked-by <number>[,<number>...]] [--no-commit] [--json]",
  "       dryland ticket resolve <map>/<number> --answer <text> [--no-commit] [--json]",
  "       dryland map show <map> [--json]",
  "       dryland map frontier <map> [--json]",
  "",
].join("\n");

interface Output {
  value: unknown;
  text: string;
  /** Written to stderr; the command still succeeded. */
  warnings?: string[];
}

interface Flags {
  noCommit: boolean;
  /** Options that take a value, by name without the leading `--`. */
  values: Record<string, string>;
}

const VALUE_FLAGS = ["map", "title", "type", "question", "blocked-by", "answer"];

/** The value of `--name`, or an error naming the flag that is missing. */
function required(flags: Flags, name: string): string {
  const value = flags.values[name];
  if (value === undefined) {
    throw new DrylandError(`--${name} is required.`, `Add --${name} <value>; run \`dryland\` for usage.`);
  }
  return value;
}

/** `false` when the user passed `--no-commit`; otherwise git's `dryland.autoCommit` decides. */
const autoCommit = (flags: Flags) => (flags.noCommit ? false : undefined);

/** Every command: whether it takes a target (a ticket or map), and what it prints. */
const COMMANDS: Record<string, { target: boolean; run: (target: string, flags: Flags) => Promise<Output> }> = {
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
      return { value: ticket, text: formatTicket(ticket) };
    },
  },
  "ticket claim": {
    target: true,
    run: async (target, flags) => {
      const holder = process.env["DRYLAND_SESSION_ID"] || (await branchHolder(nodeProcessRunner, process.cwd()));
      const { ticket, warnings } = await claimTicket(nodeProcessRunner, process.cwd(), target, {
        holder,
        autoCommit: autoCommit(flags),
      });
      return { value: ticket, text: `Claimed ${ticket.map}/${ticket.id} for ${holder}.\n`, warnings };
    },
  },
  "ticket release": {
    target: true,
    run: async (target, flags) => {
      const { ticket, warnings } = await releaseTicket(nodeProcessRunner, process.cwd(), target, {
        autoCommit: autoCommit(flags),
      });
      return { value: ticket, text: `Released ${ticket.map}/${ticket.id}.\n`, warnings };
    },
  },
  "ticket create": {
    target: false,
    run: async (_target, flags) => {
      const { ticket, warnings } = await createTicket(
        nodeProcessRunner,
        process.cwd(),
        {
          map: required(flags, "map"),
          title: required(flags, "title"),
          type: required(flags, "type"),
          question: flags.values["question"],
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
    run: async (target, flags) => {
      const { ticket, warnings } = await resolveTicket(
        nodeProcessRunner,
        process.cwd(),
        target,
        required(flags, "answer"),
        { autoCommit: autoCommit(flags) },
      );
      return { value: ticket, text: `Resolved ${ticket.map}/${ticket.id}.\n`, warnings };
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
};

async function run(args: string[]): Promise<number> {
  const json = args.includes("--json");
  const flags: Flags = { noCommit: args.includes("--no-commit"), values: {} };
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    const name = arg.startsWith("--") ? arg.slice(2) : "";
    if (VALUE_FLAGS.includes(name)) {
      const value = args[++i];
      if (value === undefined) throw new DrylandError(`--${name} needs a value.`, `Write it as --${name} <value>.`);
      flags.values[name] = value;
    } else if (arg !== "--json" && arg !== "--no-commit") {
      positional.push(arg);
    }
  }
  const [group, command, target] = positional;
  const entry = COMMANDS[`${group} ${command}`];

  if (entry !== undefined && entry.target === (target !== undefined)) {
    const { value, text, warnings = [] } = await entry.run(target ?? "", flags);
    for (const warning of warnings) process.stderr.write(`dryland: warning: ${warning}\n`);
    process.stdout.write(json ? `${JSON.stringify(value, null, 2)}\n` : text);
    return 0;
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

