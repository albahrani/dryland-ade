import type { LiveEvent, TicketChangedPayload } from "@dryland/core";
import { useEffect, useRef } from "react";
import type { LiveEventsPanelMode } from "../../shared/api.ts";

/** What an event says in one line: a Dryland write names its command and target, a session event its payload. */
function describe(event: LiveEvent): string {
  if (event.payload === undefined) return "";
  if (event.kind === "ticket.changed") {
    const { command, ticket, map } = event.payload as TicketChangedPayload;
    if (typeof command === "string") return [command, ticket ?? map].filter((part) => part !== undefined).join(" ");
  }
  return JSON.stringify(event.payload);
}

function time(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleTimeString();
}

/** The live-events panel: session events and Dryland writes as they arrive, never stored. */
export function LiveEventsPanel({
  events,
  mode,
  onMode,
}: {
  events: readonly LiveEvent[];
  mode: LiveEventsPanelMode;
  onMode: (mode: LiveEventsPanelMode) => void;
}) {
  const shown = mode === "line" ? events.slice(-1) : events;
  const log = useRef<HTMLDivElement>(null);
  // Follows the newest event, like a terminal.
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [events, mode]);
  return (
    <section className={`panel ${mode}`} hidden={mode === "hidden"} aria-label="Live events panel">
      <div className="panel-toolbar">
        <span className="panel-title">Live events</span>
        <button aria-pressed={mode === "expanded"} onClick={() => onMode("expanded")}>
          Expand
        </button>
        <button aria-pressed={mode === "line"} onClick={() => onMode("line")}>
          One line
        </button>
        <button onClick={() => onMode("hidden")}>Hide</button>
      </div>
      <div className="live-events" role="log" aria-label="Live events" ref={log}>
        {events.length === 0 ? (
          <p className="empty">No live events yet.</p>
        ) : (
          <ul>
            {shown.map((event, index) => (
              <li key={events.length - shown.length + index}>
                <time dateTime={event.timestamp}>{time(event.timestamp)}</time>
                <span className="live-kind">{event.kind}</span>
                <span>{describe(event)}</span>
                {event.session_id !== "" && <span className="live-session">{event.session_id}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
