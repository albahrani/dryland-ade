import type { TicketStatus } from "@dryland/core";

export interface StatusMeta {
  label: string;
  /** The icon glyph. */
  shape: string;
  /** A CSS colour for the icon and progress segment. */
  colour: string;
  /** One line for the legend. */
  meaning: string;
  /** Sort position: lower comes first. */
  order: number;
}

/** The one place a ticket status gets its label, icon, colour, legend text and sort order. */
export const STATUS_META: Record<TicketStatus, StatusMeta> = {
  ready: {
    label: "Ready",
    shape: "○",
    colour: "var(--ready)",
    meaning: "open, nothing blocks it and nobody holds it",
    order: 0,
  },
  "in-progress": {
    label: "In progress",
    shape: "◐",
    colour: "var(--progress)",
    meaning: "claimed by a session or branch",
    order: 1,
  },
  blocked: {
    label: "Blocked",
    shape: "⊘",
    colour: "var(--blocked)",
    meaning: "waits on tickets that are not done, or on blockers the tracker cannot report",
    order: 2,
  },
  done: {
    label: "Done",
    shape: "●",
    colour: "var(--done)",
    meaning: "resolved; folded into one line per map",
    order: 3,
  },
};

/** Every status, in sort order. */
export const TICKET_STATUSES = (Object.keys(STATUS_META) as TicketStatus[]).sort(
  (a, b) => STATUS_META[a].order - STATUS_META[b].order,
);
