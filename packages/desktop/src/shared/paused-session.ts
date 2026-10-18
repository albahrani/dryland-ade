import type { PausedWas, SessionState, TicketRef } from "@dryland/core";

/** A claimed ticket's session no live Dryland session runs, as the tab and the tree show it (ADR 0010). */
export interface PausedSession {
  /** The Agent CLI's own session id, the one a resume names. */
  sessionId: string;
  /** The Agent adapter's id and the CLI's name. */
  agentId: string;
  agent: string;
  /** The command that resumes it by hand in the ticket's worktree, such as `claude --resume <id>`. */
  resumeCommand: string | null;
  was: PausedWas;
  /** ISO timestamp the session index last saw it. */
  lastSeen: string;
  /** The branch holding the claim; `null` when the tracker names none. */
  branch: string | null;
}

/** How loudly a paused badge asks for the user: gold for a session that was waiting, red for an interrupted one. */
export type PausedTone = "gold" | "red" | "plain";

const TONES: Record<NonNullable<PausedWas>, PausedTone> = { waiting: "gold", interrupted: "red" };
// Spelt as core's `pausedLabel` does, which the renderer cannot import: core reads files.
const LABELS: Record<NonNullable<PausedWas>, string> = {
  waiting: "Paused: was waiting on you",
  interrupted: "Paused: interrupted",
};

/** The label and colour of the pause badge on a paused session's agent icon, and of the pill in its ticket's header. */
export function pausedBadge(was: PausedWas): { label: string; tone: PausedTone } {
  return { label: was === null ? "Paused" : LABELS[was], tone: was === null ? "plain" : TONES[was] };
}

/**
 * The paused session each ticket shows, by `ticketKey`: those of `paused` whose ticket has no live session. A
 * session that has ended is not live; it is what the claim's paused session stands for.
 */
export function pausedSessions(
  paused: Readonly<Record<string, PausedSession>>,
  sessions: readonly { id: string; ticket: { map: string; id: string } | null }[],
  states: Readonly<Record<string, SessionState>>,
): Map<string, PausedSession> {
  const live = new Set(
    sessions.flatMap(({ id, ticket }) =>
      ticket !== null && (states[id] ?? "launched") !== "ended" ? [`${ticket.map}/${ticket.id}`] : [],
    ),
  );
  return new Map(Object.entries(paused).filter(([key]) => !live.has(key)));
}

/**
 * The tickets of `paused` (by `ticketKey`) to resume together: all of them, or those on `map`. A ticket key is
 * `<map>/<id>`; the id never holds a slash.
 */
export function pausedTickets(paused: Readonly<Record<string, PausedSession>>, map: string | null): TicketRef[] {
  return Object.keys(paused).flatMap((key) => {
    const slash = key.lastIndexOf("/");
    const ticket = { map: key.slice(0, slash), id: key.slice(slash + 1) };
    return slash > 0 && (map === null || ticket.map === map) ? [ticket] : [];
  });
}
