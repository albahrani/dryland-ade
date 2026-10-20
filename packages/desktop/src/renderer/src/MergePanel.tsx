import { useState } from "react";
import type { MergeStrategy } from "@dryland/core";
import { MERGE_STRATEGIES, type MergeCheckView } from "../../shared/source-control.ts";

const STRATEGY_LABEL: Record<MergeStrategy, string> = {
  merge: "Merge commit",
  "fast-forward": "Fast-forward only",
  squash: "Squash",
};

/**
 * The Merge section of Source Control for a local-markdown project: the dry-run result, the merge with a chosen
 * strategy and optional cleanup, and pruning behind a confirmation. Dryland never resolves a conflict; it can
 * hand it to the ticket's session as a pre-typed prompt.
 */
export function MergePanel({
  root,
  check,
  onChanged,
}: {
  root: string;
  check: MergeCheckView;
  /** Called after an action, so the pane and the project read again. */
  onChanged: () => void;
}) {
  const [strategy, setStrategy] = useState<MergeStrategy>("merge");
  const [cleanup, setCleanup] = useState(false);
  const [confirmingPrune, setConfirmingPrune] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const blocked = check.blockerMessages.length > 0;
  const hasConflicts = check.blockers.some((b) => b.kind === "conflicts");

  const act = async (run: () => Promise<{ ok: boolean; message?: string; done?: string }>) => {
    setNotice(null);
    setFailure(null);
    try {
      const result = await run();
      if (result.ok) setNotice(result.done ?? null);
      else setFailure(result.message ?? "That did not work.");
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : String(reason));
    }
    onChanged();
  };

  const merge = () =>
    act(async () => {
      const result = await window.dryland.sourceControlMerge(root, strategy, cleanup);
      if (!result.ok) return result;
      const { cleanup: cleaned, base } = result.result;
      const tail =
        cleaned === null
          ? ""
          : cleaned.removed
            ? " Worktree and branch removed."
            : ` Worktree kept: ${cleaned.refused}`;
      return { ok: true, done: `Merged into ${base}.${tail}` };
    });

  return (
    <section aria-label="Merge" className="merge-panel">
      <h4>Merge into {check.base}</h4>
      <ul aria-label="Dry run">
        {check.blockerMessages.map((message) => (
          <li key={message} className="merge-blocker">
            Blocked: {message}
          </li>
        ))}
        {check.hints.map((hint) => (
          <li key={hint} className="merge-hint">
            Hint: {hint}
          </li>
        ))}
        {!blocked && check.hints.length === 0 && <li>Ready: {check.ahead} commit(s) to merge, no conflicts.</li>}
      </ul>

      {hasConflicts && (
        <button
          onClick={() =>
            act(() =>
              window.dryland
                .sourceControlHandToAgent(root)
                .then((r) => ({ ...r, done: "Prompt typed into the session; press Enter there to send it." })),
            )
          }
        >
          Hand conflicts to agent
        </button>
      )}

      <label>
        Strategy{" "}
        <select value={strategy} onChange={(event) => setStrategy(event.target.value as MergeStrategy)}>
          {MERGE_STRATEGIES.map((name) => (
            <option key={name} value={name}>
              {STRATEGY_LABEL[name]}
            </option>
          ))}
        </select>
      </label>
      <label>
        <input type="checkbox" checked={cleanup} onChange={(event) => setCleanup(event.target.checked)} /> Remove
        worktree and branch afterwards
      </label>
      <button disabled={blocked} title={blocked ? check.blockerMessages.join("; ") : undefined} onClick={merge}>
        Merge
      </button>
      {blocked && <p className="link-note">The merge is disabled: {check.blockerMessages.join("; ")}.</p>}

      {confirmingPrune ? (
        <div role="alertdialog" aria-label="Confirm prune">
          <p>
            Remove worktree {root} and branch {check.branch}?
          </p>
          <button
            onClick={() => {
              setConfirmingPrune(false);
              void act(() =>
                window.dryland.sourceControlPrune(root).then((r) => ({ ...r, done: "Worktree and branch removed." })),
              );
            }}
          >
            Confirm prune
          </button>
          <button onClick={() => setConfirmingPrune(false)}>Cancel</button>
        </div>
      ) : (
        <button onClick={() => setConfirmingPrune(true)}>Prune worktree…</button>
      )}

      {notice !== null && <p role="status">{notice}</p>}
      {failure !== null && (
        <p className="notice" role="alert">
          {failure}
        </p>
      )}
    </section>
  );
}
