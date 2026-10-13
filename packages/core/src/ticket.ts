export const TICKET_TYPES = ["research", "prototype", "grilling", "task"] as const;
export type TicketType = (typeof TICKET_TYPES)[number] | "none";
export type TicketState = "open" | "claimed" | "resolved";

/** The five canonical triage roles; the label strings a repo uses for them come from its triage-labels doc. */
export const TRIAGE_ROLES = ["needs-triage", "needs-info", "ready-for-agent", "ready-for-human", "wontfix"] as const;
export type TriageRole = (typeof TRIAGE_ROLES)[number];

export interface Ticket {
  /** Ticket number within its map, as written in the file name (`01`, `20`). */
  id: string;
  /** The parent map: the effort the ticket belongs to (the directory under `.scratch/`). */
  map: string;
  title: string;
  type: TicketType;
  state: TicketState;
  /** Who holds the claim, when the tracker records it; `null` when unclaimed or not recorded. */
  claimant: string | null;
  /** Ids of the tickets blocking this one, or `"unknown"` when the backend cannot say. */
  blockers: string[] | "unknown";
  /** The repo's triage role for the ticket, `null` when it carries none. */
  triageRole: TriageRole | null;
  /** The ticket text between its header fields and its `## Answer` / `## Comments` sections. */
  body: string;
  /** What `## Answer` records; `null` while unanswered. */
  answer: string | null;
  comments: string[];
  /** Backend extras the rules never read; for local markdown, the header fields Dryland does not interpret. */
  raw: Record<string, string>;
}

/** Where a ticket sits in the skill workflow. Derived from type, never stored. */
export type TicketKind = "planning" | "implementation";

export function ticketKind(ticket: Pick<Ticket, "type">): TicketKind {
  return ticket.type === "task" || ticket.type === "none" ? "implementation" : "planning";
}
