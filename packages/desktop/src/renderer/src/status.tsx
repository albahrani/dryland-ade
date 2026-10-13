import type { TicketStatus } from "@dryland/core";

export const STATUS_LABEL: Record<TicketStatus, string> = {
  ready: "Ready",
  "in-progress": "In progress",
  blocked: "Blocked",
  done: "Done",
};

const SHAPE: Record<TicketStatus, string> = {
  ready: "○",
  "in-progress": "◐",
  blocked: "⊘",
  done: "●",
};

/** A status icon with its text tooltip; the label is also its accessible name. */
export function StatusIcon({ status }: { status: TicketStatus }) {
  return (
    <span
      className={`status status-${status}`}
      title={STATUS_LABEL[status]}
      role="img"
      aria-label={STATUS_LABEL[status]}
    >
      {SHAPE[status]}
    </span>
  );
}
