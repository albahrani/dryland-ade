import type { SessionState } from "@dryland/core";

export interface ActivityStatusOptions {
  /** How long a CLI's output must pause before it counts as idle. */
  quietMs: number;
  report(sessionId: string, state: SessionState): void;
}

export interface ActivityStatus {
  /** The session's CLI printed something. */
  output(sessionId: string): void;
  /** The session's process ended; nothing more is guessed for it. */
  forget(sessionId: string): void;
}

/** About how long a CLI's output pauses between the steps of a turn; a guess, which is why the status is marked. */
export const ACTIVITY_QUIET_MS = 3000;

/**
 * The status of a CLI with no hooks, guessed from its terminal: working while it prints, idle once it has paused.
 * It cannot tell a question from a pause, so it never reports waiting. "Ended" is not guessed: it comes from the
 * process exiting.
 */
export function createActivityStatus({ quietMs, report }: ActivityStatusOptions): ActivityStatus {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  return {
    output(sessionId) {
      const pending = timers.get(sessionId);
      if (pending === undefined) report(sessionId, "running");
      else clearTimeout(pending);
      timers.set(
        sessionId,
        setTimeout(() => {
          timers.delete(sessionId);
          report(sessionId, "idle");
        }, quietMs),
      );
    },
    forget(sessionId) {
      clearTimeout(timers.get(sessionId));
      timers.delete(sessionId);
    },
  };
}
