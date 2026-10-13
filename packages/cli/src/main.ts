import { DrylandError, listTickets, nodeProcessRunner, type Ticket } from "@dryland/core";

function formatTickets(tickets: Ticket[]): string {
  if (tickets.length === 0) return "No tickets.\n";
  const columnWidth = (pick: (ticket: Ticket) => string) => Math.max(...tickets.map((ticket) => pick(ticket).length));
  const stateWidth = columnWidth((ticket) => ticket.state);
  const typeWidth = columnWidth((ticket) => ticket.type);
  return tickets
    .map((t) => `${t.map}/${t.id}  ${t.state.padEnd(stateWidth)}  ${t.type.padEnd(typeWidth)}  ${t.title}\n`)
    .join("");
}

async function run(args: string[]): Promise<number> {
  const json = args.includes("--json");
  const [group, command] = args.filter((arg) => arg !== "--json");

  if (group === "ticket" && command === "list") {
    const tickets = await listTickets(nodeProcessRunner, process.cwd());
    process.stdout.write(json ? `${JSON.stringify(tickets, null, 2)}\n` : formatTickets(tickets));
    return 0;
  }

  process.stderr.write("Usage: dryland ticket list [--json]\n");
  return 2;
}

try {
  process.exitCode = await run(process.argv.slice(2));
} catch (error) {
  if (!(error instanceof DrylandError)) throw error;
  process.stderr.write(`dryland: ${error.message}\nNext: ${error.nextAction}\n`);
  process.exitCode = 1;
}
