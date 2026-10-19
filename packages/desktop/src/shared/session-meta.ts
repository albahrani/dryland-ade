import type { SessionState, TicketRef } from "@dryland/core";
import { ticketKey } from "./tabs.ts";

/**
 * The one place a session state gets its badge glyph, the words of its tooltip, and how much it needs the user:
 * lower comes first.
 */
export const SESSION_META: Record<SessionState, { label: string; glyph: string; urgency: number }> = {
  waiting: { label: "waiting for you", glyph: "…", urgency: 0 },
  running: { label: "working", glyph: "◠", urgency: 1 },
  idle: { label: "idle", glyph: "–", urgency: 2 },
  launched: { label: "launched", glyph: "•", urgency: 3 },
  ended: { label: "ended", glyph: "■", urgency: 4 },
};

/**
 * The words for a session state. A state guessed from a hookless CLI's output says so; "ended" comes from the
 * process exiting, so it is exact either way.
 */
export function stateLabel(state: SessionState, approximate: boolean | undefined): string {
  const { label } = SESSION_META[state];
  return approximate && state !== "ended" ? `${label} (approximate)` : label;
}

/** The session working on a ticket, as its badge shows it. */
export interface TicketSession {
  agent: string;
  state: SessionState;
  /** Set when the state was guessed, not reported by the CLI. */
  approximate?: true;
}

/**
 * The session each ticket shows, by `ticketKey`: of a ticket's sessions, the one that most needs the user, and
 * the newest of equals. `sessions` are in the order they started; one with no state yet is launched. Sessions on
 * no ticket are left out.
 */
export function ticketSessions(
  sessions: readonly {
    id: string;
    agent: { name: string };
    ticket: TicketRef | null;
    statusApproximate?: true;
  }[],
  states: Readonly<Record<string, SessionState>>,
): Map<string, TicketSession> {
  const shown = new Map<string, TicketSession>();
  for (const session of sessions) {
    // A map's own session, or a new map's, shows on no ticket.
    if (session.ticket === null) continue;
    const key = ticketKey(session.ticket);
    const candidate: TicketSession = {
      agent: session.agent.name,
      state: states[session.id] ?? "launched",
      ...(session.statusApproximate ? { approximate: true as const } : {}),
    };
    const current = shown.get(key);
    if (current === undefined || SESSION_META[candidate.state].urgency <= SESSION_META[current.state].urgency) {
      shown.set(key, candidate);
    }
  }
  return shown;
}
