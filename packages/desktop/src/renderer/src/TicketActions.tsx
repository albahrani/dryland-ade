import type { TicketDetail } from "@dryland/core";
import { useState } from "react";
import type { TicketAction } from "../../shared/tracker-actions.ts";

/** Runs a ticket action; resolves with whether `dryland` made the change. */
export type TicketActionHandler = (action: TicketAction) => Promise<boolean>;

/**
 * A ticket's own actions: claim, resolve, unblock, and release of a claim that is possibly stale. Started here, each
 * runs at once, without a confirmation.
 */
export function TicketActions({
  ticket,
  stale,
  onAction,
}: {
  ticket: TicketDetail;
  /** Whether its claim is possibly stale: no live session works on it and no ticket worktree is on its branch. */
  stale: boolean;
  onAction: TicketActionHandler;
}) {
  const [resolving, setResolving] = useState(false);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  if (ticket.status === "done") return null;
  const ref = { map: ticket.map, id: ticket.id };
  const staleClaim = ticket.status === "in-progress" && stale;
  const run = async (action: TicketAction) => {
    setBusy(true);
    try {
      return await onAction(action);
    } finally {
      setBusy(false);
    }
  };
  const blockers = ticket.blockers === "unknown" ? [] : ticket.blockers;

  return (
    <section className="ticket-actions" aria-label="Ticket actions">
      {staleClaim && (
        <p className="stale-claim" role="status">
          Claimed by {ticket.claimant ?? "someone"}, possibly stale: no live Dryland session works on it and no ticket
          worktree is on that branch. It stays claimed until you release it.
        </p>
      )}
      <div className="action-row">
        {ticket.status !== "in-progress" && (
          <button disabled={busy} onClick={() => void run({ kind: "claim", ticket: ref })}>
            Claim
          </button>
        )}
        {staleClaim && (
          <button disabled={busy} onClick={() => void run({ kind: "release", ticket: ref })}>
            Release
          </button>
        )}
        {blockers.map((blocker) => (
          <button key={blocker} disabled={busy} onClick={() => void run({ kind: "unblock", ticket: ref, blocker })}>
            Unblock from {blocker}
          </button>
        ))}
        <button aria-expanded={resolving} disabled={busy} onClick={() => setResolving(!resolving)}>
          Resolve...
        </button>
      </div>
      {resolving && (
        <form
          className="resolve-form"
          onSubmit={(event) => {
            event.preventDefault();
            void run({ kind: "resolve", ticket: ref, answer: answer.trim() }).then((done) => {
              if (done) setResolving(false);
            });
          }}
        >
          <label>
            Answer
            <textarea value={answer} onChange={(event) => setAnswer(event.target.value)} rows={4} />
          </label>
          <button type="submit" disabled={busy || answer.trim() === ""}>
            Resolve
          </button>
        </form>
      )}
    </section>
  );
}
