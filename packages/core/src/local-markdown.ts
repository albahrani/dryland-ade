import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Ticket, TicketState, TicketType } from "./ticket.ts";

const TICKET_FILE = /^(\d+)-.+\.md$/;
const TYPES: readonly string[] = ["research", "prototype", "grilling", "task"];

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
  const type = (TYPES.includes(rawType) ? rawType : "none") as TicketType;
  const status = field("Status")?.toLowerCase() ?? "";
  const state: TicketState = status === "resolved" ? "resolved" : status === "claimed" ? "claimed" : "open";
  return { id, map, title, type, state };
}

/** Reads every `.scratch/<map>/issues/NN-*.md` under `root`, ordered by map then number. */
export async function readLocalMarkdownTickets(root: string): Promise<Ticket[]> {
  const scratch = join(root, ".scratch");
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
