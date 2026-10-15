import { unresolvedBlockers } from "./map.ts";
import type { EffortSnapshot } from "./next-step.ts";
import { byTicketNumber, type Ticket, type TicketType, ticketKind } from "./ticket.ts";

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

/** One ticket's row: its status and unresolved blockers read against `siblings`, the tickets of its map. */
export function toTreeTicket(ticket: Ticket, siblings: Ticket[]): TreeTicket {
  const blockers = unresolvedBlockers(ticket, siblings);
  return {
    id: ticket.id,
    map: ticket.map,
    title: ticket.title,
    type: ticket.type,
    status: statusOf(ticket, blockers),
    claimant: ticket.claimant,
    blockers,
  };
}

/**
 * Groups tickets by map, then by kind. Every effort with a map file, a spec or a ticket is a map of the tree, so a
 * Next-up marker on a spec-only effort has a row to sit on.
 */
export function buildTicketsTree(tickets: Ticket[], efforts: EffortSnapshot[]): TicketsTree {
  const maps = new Map(efforts.flatMap((e) => (e.map === null ? [] : [[e.name, e.map] as const])));
  const names = new Set([
    ...efforts.filter((e) => e.map !== null || e.hasSpec).map((e) => e.name),
    ...tickets.map((t) => t.map),
  ]);
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
        const row = toTreeTicket(ticket, own);
        if (row.status === "done") node.done.push(row);
        else node[ticketKind(ticket)].push(row);
      }
      return node;
    }),
  };
}
