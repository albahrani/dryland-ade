import type { TicketStatus } from "@dryland/core";
import { STATUS_LABEL, StatusIcon } from "./status.tsx";

const MEANING: Record<TicketStatus, string> = {
  ready: "open, nothing blocks it and nobody holds it",
  "in-progress": "claimed by a session or branch",
  blocked: "waits on tickets that are not done, or on blockers the tracker cannot report",
  done: "resolved; folded into one line per map",
};

export function Legend({ onDismiss }: { onDismiss: () => void }) {
  return (
    <aside className="legend" aria-label="Legend">
      <div className="legend-head">
        <strong>Legend</strong>
        <button onClick={onDismiss} aria-label="Dismiss legend">
          ×
        </button>
      </div>
      <ul>
        {(Object.keys(MEANING) as TicketStatus[]).map((status) => (
          <li key={status}>
            <StatusIcon status={status} /> <span>{STATUS_LABEL[status]}</span>: {MEANING[status]}
          </li>
        ))}
      </ul>
    </aside>
  );
}
