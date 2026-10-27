export const TICKET_TYPES = ["research", "prototype", "grilling", "task"] as const;
export type TicketType = (typeof TICKET_TYPES)[number] | "none";
export type TicketState = "open" | "claimed" | "resolved";

/** The five canonical triage roles; the label strings a repo uses for them come from its triage-labels doc. */
export const TRIAGE_ROLES = ["needs-triage", "needs-info", "ready-for-agent", "ready-for-human", "wontfix"] as const;
export type TriageRole = (typeof TRIAGE_ROLES)[number];

export interface Ticket {
  /** Ticket number within its map (`01`, `20`). */
  id: string;
  /** The parent map: the effort the ticket belongs to. */
  map: string;
  title: string;
  type: TicketType;
  state: TicketState;
  /** Who holds the claim; `null` when unclaimed. */
  claimant: string | null;
  /** Ids of the tickets blocking this one, or `"unknown"` when they cannot be said. */
  blockers: string[] | "unknown";
  /** The repo's triage role for the ticket, `null` when it carries none. */
  triageRole: TriageRole | null;
  /** The ticket's Report. */
  body: string;
  /** The answer the ticket was resolved with; `null` while unanswered. */
  answer: string | null;
  comments: string[];
  /** Repo-relative path of the effort's spec the ticket links to. */
  spec?: string | null;
  /** The acceptance criteria with their ticks. */
  criteria?: { text: string; done: boolean }[];
}

/** Where a ticket sits in the skill workflow. Derived from type, never stored. */
export type TicketKind = "planning" | "implementation";

export function ticketKind(ticket: Pick<Ticket, "type">): TicketKind {
  return ticket.type === "task" || ticket.type === "none" ? "implementation" : "planning";
}

/** Orders tickets by map, then by ticket number, lowest first. */
export function byTicketNumber(a: Pick<Ticket, "map" | "id">, b: Pick<Ticket, "map" | "id">): number {
  return a.map.localeCompare(b.map) || Number(a.id) - Number(b.id);
}
