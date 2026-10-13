import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseMap, unresolvedBlockers } from "./map.ts";
import { byTicketNumber, type Ticket, type TicketType, ticketKind } from "./ticket.ts";
import { readTickets } from "./tickets.ts";

/** What a ticket's row shows as its icon: ready, in progress, blocked or done. */
export type TicketStatus = "ready" | "in-progress" | "blocked" | "done";

export interface TreeTicket {
  id: string;
  map: string;
  title: string;
  type: TicketType;
  status: TicketStatus;
  claimant: string | null;
  /** The blockers still unresolved, or `"unknown"` when the backend cannot say. */
  blockers: string[] | "unknown";
}

export interface TicketsTreeMap {
  name: string;
  title: string;
  /** Items the map lists as not yet specified. */
  fog: string[];
  planning: TreeTicket[];
  implementation: TreeTicket[];
  /** Resolved tickets of every kind, folded into one group. */
  done: TreeTicket[];
}

export interface TicketsTree {
  maps: TicketsTreeMap[];
}

function statusOf(ticket: Ticket, blockers: string[] | "unknown"): TicketStatus {
  if (ticket.state === "resolved") return "done";
  if (ticket.state === "claimed") return "in-progress";
  return blockers === "unknown" || blockers.length > 0 ? "blocked" : "ready";
}

/** Groups tickets by map, then by kind; `maps` supplies the map files read, keyed by map name. */
export function buildTicketsTree(tickets: Ticket[], maps: Map<string, { title: string; fog: string[] }>): TicketsTree {
  const names = new Set([...maps.keys(), ...tickets.map((t) => t.map)]);
  return {
    maps: [...names].sort().map((name) => {
      const own = tickets.filter((t) => t.map === name).sort(byTicketNumber);
      const node: TicketsTreeMap = {
        name,
        title: maps.get(name)?.title || name,
        fog: maps.get(name)?.fog ?? [],
        planning: [],
        implementation: [],
        done: [],
      };
      for (const ticket of own) {
        const blockers = unresolvedBlockers(ticket, own);
        const row: TreeTicket = {
          id: ticket.id,
          map: ticket.map,
          title: ticket.title,
          type: ticket.type,
          status: statusOf(ticket, blockers),
          claimant: ticket.claimant,
          blockers,
        };
        if (row.status === "done") node.done.push(row);
        else node[ticketKind(ticket)].push(row);
      }
      return node;
    }),
  };
}

/** Reads every map and ticket of the main checkout into the tree the Tickets view shows. */
export async function readTicketsTree(mainCheckout: string): Promise<TicketsTree> {
  const tickets = await readTickets(mainCheckout);
  const scratch = join(mainCheckout, ".scratch");
  const entries = await readdir(scratch, { withFileTypes: true }).catch(() => []);
  const maps = new Map<string, { title: string; fog: string[] }>();
  for (const entry of entries.filter((e) => e.isDirectory())) {
    const text = await readFile(join(scratch, entry.name, "map.md"), "utf8").catch(() => null);
    if (text === null) continue;
    const { title, fog } = parseMap(entry.name, text);
    maps.set(entry.name, { title, fog });
  }
  return buildTicketsTree(tickets, maps);
}
