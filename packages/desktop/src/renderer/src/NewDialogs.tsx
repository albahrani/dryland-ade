import type { TicketsTree } from "@dryland/core";
import { useState } from "react";
import {
  commandLine,
  CREATE_STATUSES,
  CREATE_TYPES,
  type CreateStatus,
  type CreateType,
  type NewTicket,
  trackerArgs,
} from "../../shared/tracker-actions.ts";
import { StartWork, type StartHandler } from "./StartWork.tsx";

function Dialog({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

/**
 * New ticket: map, title, type, question and blocked-by, with the exact `dryland ticket create` command it will run
 * shown as the fields change. Creating hands the ticket on; asking for confirmation is the caller's part.
 */
export function NewTicketDialog({
  tree,
  initialMap,
  autoCommit,
  onCreate,
  onCancel,
}: {
  tree: TicketsTree;
  /** The map preselected, such as that of the focused tab. */
  initialMap: string | null;
  /** Whether the write is committed, so the preview names exactly what runs. */
  autoCommit: boolean;
  onCreate: (ticket: NewTicket) => void;
  onCancel: () => void;
}) {
  const [map, setMap] = useState(tree.maps.find((m) => m.name === initialMap)?.name ?? tree.maps[0]?.name ?? "");
  const [title, setTitle] = useState("");
  const [type, setType] = useState<CreateType>("task");
  const [question, setQuestion] = useState("");
  const [blockedBy, setBlockedBy] = useState<string[]>([]);
  const [status, setStatus] = useState<CreateStatus | undefined>(undefined);
  const chosen = tree.maps.find((m) => m.name === map);
  // Only a ticket still to be done can block the new one.
  const candidates = chosen === undefined ? [] : [...chosen.planning, ...chosen.implementation];
  const ticket: NewTicket = { map, title: title.trim(), type, question: question.trim(), blockedBy, status };
  const toggle = (id: string) =>
    setBlockedBy((current) =>
      current.includes(id) ? current.filter((n) => n !== id) : [...current, id].sort((a, b) => Number(a) - Number(b)),
    );

  if (tree.maps.length === 0) {
    return (
      <Dialog title="New ticket">
        <p>This project has no maps yet. Start one with New map, then add tickets to it.</p>
        <div className="modal-actions">
          <button onClick={onCancel}>Close</button>
        </div>
      </Dialog>
    );
  }
  return (
    <Dialog title="New ticket">
      <form
        className="dialog-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (ticket.title !== "") onCreate(ticket);
        }}
      >
        <label>
          Map
          <select
            value={map}
            onChange={(event) => {
              setMap(event.target.value);
              setBlockedBy([]);
            }}
          >
            {tree.maps.map((m) => (
              <option key={m.name} value={m.name}>
                {m.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Title
          <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label>
          Type
          <select value={type} onChange={(event) => setType(event.target.value as CreateType)}>
            {CREATE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            value={status ?? ""}
            onChange={(event) =>
              setStatus(event.target.value === "" ? undefined : (event.target.value as CreateStatus))
            }
          >
            <option value="">none (straight onto the frontier)</option>
            {CREATE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Question
          <textarea rows={3} value={question} onChange={(event) => setQuestion(event.target.value)} />
        </label>
        <fieldset>
          <legend>Blocked by</legend>
          {candidates.length === 0 && <p className="empty">No open ticket on this map.</p>}
          {candidates.map((t) => (
            <label key={t.id} className="check">
              <input type="checkbox" checked={blockedBy.includes(t.id)} onChange={() => toggle(t.id)} />
              {t.id} {t.title}
            </label>
          ))}
        </fieldset>
        <code className="command" aria-label="Command">
          {commandLine(trackerArgs({ kind: "create", ticket }, autoCommit))}
        </code>
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={ticket.title === ""}>
            Create ticket
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** New scratch session: only the Agent CLI is chosen; it opens in a scratch worktree of its own with nothing typed. */
export function NewScratchDialog({ onStart, onCancel }: { onStart: StartHandler; onCancel: () => void }) {
  return (
    <Dialog title="New scratch session">
      <p>
        For exploratory work with no ticket. The Agent CLI opens in a new scratch worktree, so the work is isolated from
        your main checkout.
      </p>
      <StartWork onStart={onStart} label={(agent) => `Open ${agent}`} />
      <div className="modal-actions">
        <button onClick={onCancel}>Cancel</button>
      </div>
    </Dialog>
  );
}

/** New map: only the Agent CLI is chosen; the `/wayfinder` skill charts and names the map in its session. */
export function NewMapDialog({ onStart, onCancel }: { onStart: StartHandler; onCancel: () => void }) {
  return (
    <Dialog title="New map">
      <p>
        Maps are charted by the <code>/wayfinder</code> skill in the Agent CLI: describe your idea and name the effort
        there. It opens in a temporary worktree with <code>/wayfinder</code> typed, not submitted.
      </p>
      <StartWork onStart={onStart} label={(agent) => `Open ${agent}`} />
      <div className="modal-actions">
        <button onClick={onCancel}>Cancel</button>
      </div>
    </Dialog>
  );
}
