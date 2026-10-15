import type { SessionState, TicketStatus } from "@dryland/core";
import { SESSION_META } from "../../shared/session-meta.ts";
import { STATUS_META } from "../../shared/status-meta.ts";

/** A session's agent icon with its state as a badge (working arc, waiting bubble, idle dash, ended square). */
export function SessionBadge({ agent, state }: { agent: string; state: SessionState }) {
  const { label, glyph } = SESSION_META[state];
  const text = `${agent}: ${label}`;
  return (
    <span className={`session-badge ${state}`} title={text} role="img" aria-label={text}>
      <span className="agent-icon">{agent.charAt(0)}</span>
      <span className="badge">{glyph}</span>
    </span>
  );
}

/** A status icon with its text tooltip; the label is also its accessible name. */
export function StatusIcon({ status }: { status: TicketStatus }) {
  const { label, shape, colour } = STATUS_META[status];
  return (
    <span className="status" style={{ color: colour }} title={label} role="img" aria-label={label}>
      {shape}
    </span>
  );
}
