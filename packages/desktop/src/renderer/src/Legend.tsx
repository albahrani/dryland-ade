import { STATUS_META, TICKET_STATUSES } from "../../shared/status-meta.ts";
import { StatusIcon } from "./status.tsx";

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
        {TICKET_STATUSES.map((status) => (
          <li key={status}>
            <StatusIcon status={status} /> <span>{STATUS_META[status].label}</span>: {STATUS_META[status].meaning}
          </li>
        ))}
      </ul>
    </aside>
  );
}
