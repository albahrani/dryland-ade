import type { MarkedItem, NextUpMarker, TreeTicket } from "@dryland/core";
import { formatBlockers } from "./blockers.ts";

/** What the views need of the project's next steps. Types only from core: this module runs in the renderer too. */
export interface NextUp {
  /** The items that carry a Next-up marker, best first. */
  markers: NextUpMarker[];
  /** Every item some next step points at, each with its best step, best first; `markers` is its head. */
  ranked: NextUpMarker[];
}

/** No next steps: what a project that cannot be read shows. */
export const NO_NEXT_UP: NextUp = { markers: [], ranked: [] };

const isTicket = (item: MarkedItem, map: string, id: string) =>
  item.kind === "ticket" && item.map === map && item.id === id;

/** The marker on ticket `map/id`, if it carries one. */
export function ticketMarker(nextUp: NextUp, map: string, id: string): NextUpMarker | undefined {
  return nextUp.markers.find(({ item }) => isTicket(item, map, id));
}

/** The marker on map `map` itself, if it carries one: never one of its tickets' markers. */
export function mapMarker(nextUp: NextUp, map: string): NextUpMarker | undefined {
  return nextUp.markers.find(({ item }) => item.kind === "map" && item.map === map);
}

/** "Why not this?" for a ticket without a marker: its unresolved blockers, or what else keeps it unmarked. */
export function whyNotText(ticket: TreeTicket, ranked: NextUpMarker[]): string {
  if (ticket.blockers === "unknown") return "Blocking unknown: the tracker cannot say what blocks this ticket.";
  const blockers = formatBlockers(ticket.blockers);
  if (blockers !== null) return `Blocked by ${blockers}: not resolved yet.`;
  if (ticket.status === "done") return "It is done.";
  if (ticket.claimant !== null) return `It is claimed by ${ticket.claimant}.`;
  const rank = ranked.findIndex(({ item }) => isTicket(item, ticket.map, ticket.id));
  if (rank === -1) return "Nothing blocks it, but no rule recommends it.";
  return `Nothing blocks it. It is next-up item ${rank + 1}, ranked below the marked items: ${ranked[rank]?.step.reason}`;
}
