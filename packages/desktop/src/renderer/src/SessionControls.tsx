import type { SessionState } from "@dryland/core";
import type { SessionInfo } from "../../shared/api.ts";
import { SESSION_META, stateLabel } from "../../shared/session-meta.ts";
import { sessionTitle } from "../../shared/work-target.ts";
import { SessionBadge } from "./status.tsx";

/** What the views do with a live session: show it in a tab, hidden or not, or stop it. */
export interface SessionHandlers {
  state(session: SessionInfo): SessionState;
  unseen(session: SessionInfo): boolean;
  show(session: SessionInfo): void;
  stop(session: SessionInfo): void;
}

/** A dot for output the user has not seen yet. */
export function UnseenMark() {
  return (
    <span className="unseen-mark" title="Unseen output" role="img" aria-label="Unseen output">
      ●
    </span>
  );
}

/** The live sessions of a ticket or map, each with its state and Show and Stop; nothing when none is live. */
export function LiveSessions({ sessions, handlers }: { sessions: SessionInfo[]; handlers: SessionHandlers }) {
  const live = sessions.filter((session) => handlers.state(session) !== "ended");
  if (live.length === 0) return null;
  return (
    <section className="live-sessions" aria-label="Live sessions">
      {live.map((session) => {
        const state = handlers.state(session);
        return (
          <div key={session.id} className="live-session">
            <SessionBadge agent={session.agent.name} state={state} approximate={session.statusApproximate} />
            <span>{sessionTitle(session)}</span>
            <span className="session-state">{stateLabel(state, session.statusApproximate)}</span>
            {handlers.unseen(session) && <UnseenMark />}
            <button onClick={() => handlers.show(session)}>Show session</button>
            <button onClick={() => handlers.stop(session)}>Stop session</button>
          </div>
        );
      })}
    </section>
  );
}

/** Asks before stopping a session that is working or printed something the user has not seen. */
export function ConfirmStop({
  session,
  state,
  unseen,
  onConfirm,
  onCancel,
}: {
  session: SessionInfo;
  state: SessionState;
  unseen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const why =
    state === "running"
      ? "It is still working and will be cut off."
      : unseen
        ? "It printed output you have not seen, which may be a question."
        : `It is ${SESSION_META[state].label}.`;
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Stop session">
        <h2>Stop session</h2>
        <p>
          Stop {sessionTitle(session)}? {why}
        </p>
        <p>The claim is kept, and {session.agent.name} keeps the session so it can be resumed.</p>
        <div className="modal-actions">
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" autoFocus onClick={onConfirm}>
            Stop session
          </button>
        </div>
      </div>
    </div>
  );
}
