import { useEffect, useState } from "react";
import type { QuitProgress, QuitRequest, StepState } from "../../shared/quit.ts";
import { SESSION_META } from "../../shared/session-meta.ts";
import { SessionBadge } from "./status.tsx";

const STEP_MARKS: Record<StepState, string> = { pending: "·", running: "…", done: "✓", failed: "✗", abandoned: "–" };

/**
 * The question asked when the user quits while sessions run: what would stop, and after confirming, how far the
 * shutdown is. "Quit now" stays available throughout and abandons the steps still to do.
 */
export function QuitDialog({ request, onClose }: { request: QuitRequest; onClose: () => void }) {
  const [steps, setSteps] = useState<Map<string, StepState> | null>(null);

  useEffect(
    () =>
      window.dryland.onQuitProgress(({ step, state }: QuitProgress) =>
        setSteps((current) => new Map(current).set(step, state)),
      ),
    [],
  );

  const cancel = () => {
    void window.dryland.answerQuit("cancel");
    onClose();
  };
  const sessions = request.sessions;
  const count = sessions.length === 1 ? "1 session is" : `${sessions.length} sessions are`;
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Quit Dryland">
        <h2>Quit Dryland</h2>
        {steps === null ? (
          <>
            <p>
              {count} still running. Quit and stop {sessions.length === 1 ? "it" : "them"}?
            </p>
            <ul className="quit-sessions" aria-label="Running sessions">
              {sessions.map((session) => (
                <li key={session.id}>
                  <SessionBadge agent={session.agent} state={session.state} />
                  <span>{session.title}</span>
                  <span className="dim">
                    {SESSION_META[session.state].label}
                    {session.unseen ? ", unseen output" : ""} · {session.branch}
                  </span>
                </li>
              ))}
            </ul>
            <p className="dim">Claims are kept, and the Agent CLI keeps each session so it can be resumed.</p>
            <div className="modal-actions">
              <button onClick={cancel}>Cancel</button>
              <button
                className="primary"
                autoFocus
                onClick={() => {
                  setSteps(new Map());
                  void window.dryland.answerQuit("confirm");
                }}
              >
                Quit
              </button>
            </div>
          </>
        ) : (
          <>
            <p>Stopping…</p>
            <ul className="quit-steps" aria-label="Shutdown progress">
              {[...steps].map(([step, state]) => (
                <li key={step} data-state={state}>
                  <span aria-hidden="true">{STEP_MARKS[state]}</span> {step}
                  <span className="visually-hidden"> ({state})</span>
                </li>
              ))}
            </ul>
            <div className="modal-actions">
              <button className="primary" autoFocus onClick={() => void window.dryland.answerQuit("now")}>
                Quit now
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
