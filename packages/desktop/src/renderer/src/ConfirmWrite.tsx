import { useState } from "react";
import { CONFIRMATION_LABELS, type ConfirmationType } from "../../shared/tracker-actions.ts";

/** A write waiting for the user's click: what it does, and the exact command that will do it. */
export interface PendingWrite {
  type: ConfirmationType;
  text: string;
  command: string;
}

/** Asks before a write from a general button, naming the exact `dryland` command, with a "do not ask again". */
export function ConfirmWrite({
  pending,
  onConfirm,
  onCancel,
}: {
  pending: PendingWrite;
  /** `dontAskAgain` stops this confirmation type from asking again. */
  onConfirm: (dontAskAgain: boolean) => void;
  onCancel: () => void;
}) {
  const [dontAsk, setDontAsk] = useState(false);
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Confirm write">
        <h2>Confirm write</h2>
        <p>{pending.text}</p>
        <code className="command">{pending.command}</code>
        <label>
          <input type="checkbox" checked={dontAsk} onChange={() => setDontAsk(!dontAsk)} />
          Don't ask again for {CONFIRMATION_LABELS[pending.type]}
        </label>
        <div className="modal-actions">
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" autoFocus onClick={() => onConfirm(dontAsk)}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
