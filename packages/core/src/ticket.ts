export const TICKET_TYPES = ["research", "prototype", "grilling", "task"] as const;
export type TicketType = (typeof TICKET_TYPES)[number] | "none";
export type TicketState = "open" | "claimed" | "resolved";

export interface Ticket {
  /** Ticket number within its map, as written in the file name (`01`, `20`). */
  id: string;
  /** The effort the ticket belongs to (the directory under `.scratch/`). */
  map: string;
  title: string;
  type: TicketType;
  state: TicketState;
}
