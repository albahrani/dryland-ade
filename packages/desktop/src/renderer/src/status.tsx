import type { PausedWas, SessionState, TicketStatus } from "@dryland/core";
import { SESSION_META } from "../../shared/session-meta.ts";
import { pausedBadge } from "../../shared/paused-session.ts";
import { type MapSessionCounts, mapCountsLabel } from "../../shared/sessions-view.ts";
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

/** An agent icon with a pause badge in the colour of the paused session's label: gold when waiting, red when interrupted. */
export function PausedBadge({ agent, was }: { agent: string; was: PausedWas }) {
  const { label, tone } = pausedBadge(was);
  const text = `${agent}: ${label}`;
  return (
    <span className={`session-badge paused ${tone}`} title={text} role="img" aria-label={text}>
      <span className="agent-icon">{agent.charAt(0)}</span>
      <span className="badge">⏸</span>
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

/** A map's waiting and paused counts, compact, with the breakdown in the tooltip; nothing when it has neither. */
export function MapCounts({ counts }: { counts: MapSessionCounts }) {
  const label = mapCountsLabel(counts);
  if (label === "") return null;
  return (
    <span className="map-counts" title={label} role="img" aria-label={label}>
      {counts.waiting > 0 && <span className="count waiting">{counts.waiting}</span>}
      {counts.paused > 0 && <span className="count paused">⏸{counts.paused}</span>}
    </span>
  );
}
