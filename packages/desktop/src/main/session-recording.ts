import { type LiveEvent, type ProcessRunner, recordSession, sessionStateOf } from "@dryland/core";
import type { SessionInfo } from "../shared/api.ts";
import { isScratch } from "../shared/work-target.ts";

/**
 * The session index item a session works on (ADR 0010): its ticket as `<map>/<NN>`, the map it continues, or for a
 * new map, not yet named, its scratch worktree branch.
 */
export function sessionItem(session: Pick<SessionInfo, "ticket" | "map" | "worktree">): string {
  if (session.ticket !== null) return `${session.ticket.map}/${session.ticket.id}`;
  return session.map ?? session.worktree.branch;
}

export interface SessionRecorderOptions {
  runner: ProcessRunner;
  /** The sessions Dryland started; events of any other session are ignored. */
  sessions: () => SessionInfo[];
  /** Told about an index that could not be written or had to be replaced; the index is a cache, nothing fails. */
  warn: (message: string) => void;
  /** How long a session stays in the index after it was last seen; the default when left out. */
  retentionDays?: () => number;
}

export interface SessionRecorder {
  /**
   * Records a session state event in the session index: the session's last state (none for `ended`) and last seen.
   * A CLI session id the event names that the item does not know, as after `/clear`, becomes its newest session.
   */
  apply(event: LiveEvent): void;
  /** Resolves once every write so far has landed: a shutdown flush step. Never rejects. */
  flush(): Promise<void>;
}

/** Keeps the session index current from hook events, writing in the order the events came. */
export function createSessionRecorder({ runner, sessions, warn, retentionDays }: SessionRecorderOptions): SessionRecorder {
  /** The CLI session id each session last reported, by Dryland session id. */
  const latest = new Map<string, string>();
  let pending = Promise.resolve();

  return {
    apply(event) {
      const state = sessionStateOf(event.kind);
      const session = sessions().find((s) => s.id === event.session_id);
      if (state === null || session === undefined) return;
      // An unlinked session started by hand belongs to no item of the index; the worktree it ran in is not Dryland's.
      if (session.manual && session.ticket === null && session.map === null && !isScratch(session)) return;
      const sessionId = event.agent_session_id ?? latest.get(session.id) ?? session.agentSessionId;
      if (sessionId === null) return;
      latest.set(session.id, sessionId);
      const recorded = {
        adapter: session.agent.id,
        sessionId,
        ...(state === "running" || state === "waiting" || state === "idle" ? { lastState: state } : {}),
      };
      pending = pending.then(async () => {
        try {
          const warnings = await recordSession(runner, session.worktree.path, sessionItem(session), recorded, {
            retentionDays: retentionDays?.(),
          });
          warnings.forEach(warn);
        } catch (error) {
          warn(`The session was not recorded in the session index (${(error as Error).message}).`);
        }
      });
    },
    flush: () => pending,
  };
}
