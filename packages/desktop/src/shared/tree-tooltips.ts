import type { TreeTicket } from "@dryland/core";
import { formatBlockers } from "./blockers.ts";
import { STATUS_META } from "./status-meta.ts";

/** The tooltip of a ticket row: what the row shows, untruncated, plus the Next-up reason when it has one. */
export function ticketTooltip(
  ticket: Pick<TreeTicket, "id" | "title" | "status" | "claimant" | "blockers">,
  nextUpReason: string | undefined,
): string {
  const blockers = formatBlockers(ticket.blockers);
  return [
    `${ticket.id} ${ticket.title}`,
    STATUS_META[ticket.status].label,
    ticket.claimant !== null && `claimed by ${ticket.claimant}`,
    blockers !== null && (ticket.blockers === "unknown" ? `blocked by: ${blockers}` : `blocked by ${blockers}`),
    nextUpReason,
  ]
    .filter((line): line is string => typeof line === "string")
    .join("\n");
}

/** The one-line label of a fog item: its text up to the first colon or sentence end. The full text is its tooltip. */
export function fogLabel(item: string): string {
  const flat = item.replace(/\s+/g, " ").trim();
  const end = flat.search(/:|[.!?](?=\s|$)/);
  return (end === -1 ? flat : flat.slice(0, end)).trim();
}

/** The tooltip of a map row: its title and the directory name tickets are addressed by. */
export function mapTooltip(name: string, title: string): string {
  return `${title}\n${name}`;
}
