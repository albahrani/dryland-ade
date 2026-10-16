/**
 * Which sessions printed something the user has not seen: output that arrives while a session is hidden, or while
 * its tab is not the one in view. Showing the session clears it. Kept in memory only, like the session states.
 */
export interface UnseenOutput {
  /** The session now in view, `null` when none is. Clears its mark; `true` when that changed the unseen set. */
  view(sessionId: string | null): boolean;
  /** The session printed; `true` when that marked it unseen. */
  output(sessionId: string): boolean;
  /** Drops a session that is gone; `true` when it was marked. */
  forget(sessionId: string): boolean;
  /** The sessions with unseen output. */
  ids(): string[];
  has(sessionId: string): boolean;
}

export function createUnseenOutput(): UnseenOutput {
  const unseen = new Set<string>();
  let viewed: string | null = null;
  return {
    view(sessionId) {
      viewed = sessionId;
      return sessionId !== null && unseen.delete(sessionId);
    },
    output(sessionId) {
      if (sessionId === viewed || unseen.has(sessionId)) return false;
      unseen.add(sessionId);
      return true;
    },
    forget: (sessionId) => unseen.delete(sessionId),
    ids: () => [...unseen],
    has: (sessionId) => unseen.has(sessionId),
  };
}
