import type { LiveEvent, SessionState } from "@dryland/core";

/** The session state each live event kind reports; other kinds say nothing about a session's state. */
const STATE_OF: Partial<Record<LiveEvent["kind"], SessionState>> = {
  "session.running": "running",
  "session.waiting": "waiting",
  "session.idle": "idle",
  "session.ended": "ended",
};

export interface SessionStatus {
  /** A session Dryland just spawned. */
  launched(sessionId: string): void;
  /** Applies a live event; `false` when it changed nothing, such as an event of a session Dryland did not start. */
  apply(event: LiveEvent): boolean;
  /** The session's process ended, whether or not its CLI reported it. */
  exited(sessionId: string): void;
  /** Every session's state, by session id. */
  states(): Readonly<Record<string, SessionState>>;
}

/** The live state of the sessions Dryland started. Never stored: it starts empty with the app (ADR 0008). */
export function createSessionStatus(): SessionStatus {
  const states = new Map<string, SessionState>();
  const set = (sessionId: string, state: SessionState) => {
    const current = states.get(sessionId);
    if (current === undefined || current === "ended" || current === state) return false;
    states.set(sessionId, state);
    return true;
  };
  return {
    launched: (sessionId) => void states.set(sessionId, "launched"),
    apply(event) {
      const state = STATE_OF[event.kind];
      return state !== undefined && set(event.session_id, state);
    },
    exited: (sessionId) => void set(sessionId, "ended"),
    states: () => Object.fromEntries(states),
  };
}
