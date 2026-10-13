import type { TicketStatus } from "@dryland/core";
import { STATUS_META } from "../../shared/status-meta.ts";

/** A status icon with its text tooltip; the label is also its accessible name. */
export function StatusIcon({ status }: { status: TicketStatus }) {
  const { label, shape, colour } = STATUS_META[status];
  return (
    <span className="status" style={{ color: colour }} title={label} role="img" aria-label={label}>
      {shape}
    </span>
  );
}
