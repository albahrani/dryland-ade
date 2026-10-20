import { useState } from "react";
import type { PullRequestSection } from "../../shared/source-control.ts";
import { StartWork } from "./StartWork.tsx";

const STATE_LABEL = { open: "open", merged: "merged", closed: "closed" } as const;

/**
 * The Merge/PR section of Source Control on a GitHub or GitLab project: the existing PR or MR with its state and
 * link, or the two ways to open one. Dryland opens it directly through the user's `gh`/`glab` login, or starts a
 * session with `/pr` typed so the skill writes it. The same dry-run checks gate both.
 */
export function PullRequestPanel({
  root,
  section,
  ticket,
  onStartPr,
  onChanged,
}: {
  root: string;
  section: PullRequestSection;
  /** `<map>/<NN>` of the worktree's ticket; the `/pr` path needs one. */
  ticket: string | null;
  onStartPr: (ticket: string, agentId: string) => Promise<void>;
  /** Called after an action, so the pane and the project read again. */
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const { name, request, blockerMessages, error } = section;
  const blocked = blockerMessages.length > 0;

  const open = async () => {
    setBusy(true);
    setFailure(null);
    try {
      const result = await window.dryland.sourceControlOpenPullRequest(root);
      if (!result.ok) setFailure(result.message);
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
      onChanged();
    }
  };

  return (
    <section aria-label="Pull request" className="merge-panel">
      <h4>{name === "PR" ? "Pull request" : "Merge request"}</h4>
      {request !== null ? (
        <p>
          {name} #{request.number} is {STATE_LABEL[request.state]}:{" "}
          <a href={request.url} target="_blank" rel="noreferrer">
            {request.url}
          </a>
        </p>
      ) : error !== null ? (
        <p className="notice" role="alert">
          {error}
        </p>
      ) : (
        <>
          <ul aria-label="Dry run">
            {blockerMessages.map((message) => (
              <li key={message} className="merge-blocker">
                Blocked: {message}
              </li>
            ))}
            {!blocked && <li>Ready: nothing stops opening the {name}.</li>}
          </ul>
          <button disabled={blocked || busy} title={blocked ? blockerMessages.join("; ") : undefined} onClick={open}>
            Open {name}
          </button>
          {ticket !== null && (
            <StartWork label={() => `Start session with /pr`} onStart={(agentId) => onStartPr(ticket, agentId)} />
          )}
        </>
      )}
      {failure !== null && (
        <p className="notice" role="alert">
          {failure}
        </p>
      )}
    </section>
  );
}
