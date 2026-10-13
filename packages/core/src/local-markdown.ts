import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { TICKET_TYPES, type Ticket, type TicketState, type TicketType } from "./ticket.ts";

const TICKET_FILE = /^(\d+)-.+\.md$/;

/** `claimed` and `resolved` are states; any other status (a triage role, nothing) leaves the ticket open. */
function stateOf(status: string | undefined): TicketState {
  const value = status?.toLowerCase();
  return value === "resolved" || value === "claimed" ? value : "open";
}

export function parseTicketFile(map: string, id: string, markdown: string): Ticket {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const title = lines.find((line) => line.startsWith("# "))?.slice(2).trim() ?? "";
  const firstSection = lines.findIndex((line, index) => index > 0 && line.startsWith("## "));
  const header = firstSection === -1 ? lines : lines.slice(0, firstSection);
  const field = (name: string): string | undefined => {
    const prefix = `${name.toLowerCase()}:`;
    const line = header.find((l) => l.toLowerCase().startsWith(prefix));
    return line?.slice(prefix.length).trim();
  };

  const rawType = field("Type")?.toLowerCase() ?? "";
  const type: TicketType = TICKET_TYPES.find((known) => known === rawType) ?? "none";
  return { id, map, title, type, state: stateOf(field("Status")) };
}

/** Reads every `.scratch/<map>/issues/NN-*.md` under `mainCheckout`, ordered by map then number. */
export async function readLocalMarkdownTickets(mainCheckout: string): Promise<Ticket[]> {
  const scratch = join(mainCheckout, ".scratch");
  const maps = await readdir(scratch, { withFileTypes: true }).catch(() => []);
  const tickets: Ticket[] = [];
  for (const map of maps.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()) {
    const dir = join(scratch, map, "issues");
    const files = await readdir(dir).catch(() => []);
    for (const file of files) {
      const match = TICKET_FILE.exec(file);
      if (!match?.[1]) continue;
      tickets.push(parseTicketFile(map, match[1], await readFile(join(dir, file), "utf8")));
    }
  }
  return tickets.sort((a, b) => a.map.localeCompare(b.map) || Number(a.id) - Number(b.id));
}
