import { pausedBadge, type PausedSession } from "../../shared/paused-session.ts";
import type { ResumeMode } from "../../shared/api.ts";
import { PausedBadge } from "./status.tsx";

/** "3 minutes ago"-style words are not needed here: the date and time the index last saw the session. */
const seen = (iso: string) => (Number.isNaN(Date.parse(iso)) ? "unknown" : new Date(iso).toLocaleString());

/**
 * Stands in for the terminal and the start box on a ticket whose session is paused: what it was doing, how to
 * continue it, and the three ways to go on.
 */
export function PausedBox({
  paused,
  lastOutput,
  busy,
  onResume,
  onStartFresh,
}: {
  paused: PausedSession;
  /** The session's last output line; `null` when Dryland no longer holds it, as after a restart. */
  lastOutput: string | null;
  busy: boolean;
  onResume: (mode: ResumeMode) => void;
  onStartFresh: () => void;
}) {
  const { label, tone } = pausedBadge(paused.was);
  return (
    <section className={`paused-box ${tone}`} aria-label="Paused session">
      <h2>
        <PausedBadge agent={paused.agent} was={paused.was} /> {label}
      </h2>
      <dl>
        <div>
          <dt>Agent</dt>
          <dd>{paused.agent}</dd>
        </div>
        <div>
          <dt>Session</dt>
          <dd>{paused.sessionId}</dd>
        </div>
        <div>
          <dt>Last seen</dt>
          <dd>{seen(paused.lastSeen)}</dd>
        </div>
        {paused.branch !== null && (
          <div>
            <dt>Branch</dt>
            <dd>{paused.branch}</dd>
          </div>
        )}
      </dl>
      {lastOutput !== null && <p className="paused-last-line">{lastOutput}</p>}
      <p>
        Resume continues this {paused.agent} session where it stopped, in the ticket&apos;s worktree.
        {paused.resumeCommand !== null && (
          <>
            {" "}
            By hand: <code>{paused.resumeCommand}</code>
          </>
        )}
      </p>
      <div className="paused-actions">
        <button className="primary" disabled={busy} onClick={() => onResume("resume")}>
          Resume
        </button>
        <button disabled={busy} onClick={() => onResume("pick")}>
          Pick another session
        </button>
        <button disabled={busy} onClick={onStartFresh}>
          Start fresh
        </button>
      </div>
    </section>
  );
}
