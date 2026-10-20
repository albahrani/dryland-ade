import { useCallback, useEffect, useRef, useState } from "react";
import { type ChangedFile, type ExplorerRoot, type RootHint, rootLabel } from "../../shared/explorer.ts";
import type {
  CommitGraph,
  MergeCheckView,
  PullRequestSection,
  SourceControlStatus,
  UnlinkedBranch,
} from "../../shared/source-control.ts";
import { MergePanel } from "./MergePanel.tsx";
import { PullRequestPanel } from "./PullRequestPanel.tsx";

/** How often git is asked again, for changes the watched directories do not report. */
const POLL_MS = 2000;

const STATUS_LETTER = { added: "A", modified: "M", deleted: "D", untracked: "U" } as const;

interface Loaded {
  status: SourceControlStatus;
  graph: CommitGraph;
  unlinked: UnlinkedBranch[];
  /** The dry run for a linked worktree of a local-markdown project; `null` elsewhere or when git cannot say. */
  merge: MergeCheckView | null;
  /** The PR/MR section for a linked worktree of a GitHub or GitLab project; `null` elsewhere. */
  pullRequest: PullRequestSection | null;
}

const LINK_NOTE: Record<ExplorerRoot["link"], string | null> = {
  name: null,
  trailer: "Linked by commit trailer",
  scratch: "Scratch branch",
  unlinked: "Unlinked branch",
};

/**
 * The branch, staged and changed files, commit box and commit graph of the worktree a selection belongs to. The
 * Explorer watches that worktree's directories and git directory; `revision` bumps when they change.
 */
export function SourceControl({
  hint,
  projectView,
  localTracker,
  revision,
  onOpenDiff,
  onShowWorktree,
  onStartPr,
}: {
  hint: RootHint;
  /** The project as last read; a new one may mean a worktree was made or removed, so the root is resolved again. */
  projectView: unknown;
  /** Whether the project's tracker is local markdown, the only one the Merge section serves. */
  localTracker: boolean;
  revision: number;
  onOpenDiff: (root: string, path: string) => void;
  /** Shows another worktree in this pane and the Explorer, until the selection changes. */
  onShowWorktree: (path: string) => void;
  /** Starts a session in the ticket's worktree with `/pr` typed. */
  onStartPr: (ticket: string, agentId: string) => Promise<void>;
}) {
  const [root, setRoot] = useState<ExplorerRoot | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [commitError, setCommitError] = useState<string | null>(null);
  const hintKey = JSON.stringify(hint);
  const latestHint = useRef(hint);
  latestHint.current = hint;
  const shownRoot = useRef<string | null>(null);

  useEffect(() => {
    let current = true;
    window.dryland.explorerRoot(latestHint.current).then(
      (next) => {
        if (!current) return;
        setError(null);
        if (shownRoot.current !== next.path) {
          shownRoot.current = next.path;
          setLoaded(null);
          setMessage("");
          setCommitError(null);
        }
        setRoot(next);
      },
      (reason: unknown) => current && setError(reason instanceof Error ? reason.message : String(reason)),
    );
    return () => {
      current = false;
    };
  }, [hintKey, projectView]);

  const rootPath = root?.path;
  const linked = root !== null && !root.main && root.branch !== null;
  const mergeable = localTracker && linked;
  const requestable = !localTracker && linked;
  const load = useCallback(async () => {
    if (rootPath === undefined) return;
    try {
      const [status, graph, unlinked] = await Promise.all([
        window.dryland.sourceControlStatus(rootPath),
        window.dryland.sourceControlGraph(rootPath),
        window.dryland.sourceControlUnlinked(),
      ]);
      if (shownRoot.current !== rootPath) return;
      const merge = mergeable ? await window.dryland.sourceControlMergeCheck(rootPath).catch(() => null) : null;
      const pullRequest = requestable
        ? await window.dryland.sourceControlPullRequest(rootPath).catch(() => null)
        : null;
      const next = { status, graph, unlinked, merge, pullRequest };
      setLoaded((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [rootPath, mergeable, requestable]);

  useEffect(() => {
    void load();
  }, [load, revision]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  if (error !== null)
    return (
      <p className="notice" role="alert">
        {error}
      </p>
    );
  if (root === null || loaded === null) return null;

  const act = (run: () => Promise<unknown>) => {
    setCommitError(null);
    run().then(load, (reason: unknown) => setCommitError(reason instanceof Error ? reason.message : String(reason)));
  };
  const commit = () =>
    act(async () => {
      const result = await window.dryland.sourceControlCommit(root.path, message);
      if (result.ok) setMessage("");
      else setCommitError(result.message);
    });

  const { status, graph, unlinked, merge: mergeCheck, pullRequest } = loaded;
  const fileRow = (file: ChangedFile, staged: boolean) => (
    <li key={`${staged ? "s" : "c"}:${file.path}`} className="tree-row">
      <button
        className="tree-name"
        title={`${file.status}: open diff`}
        onClick={() => onOpenDiff(root.path, file.path)}
      >
        <span className={`change change-${file.status}`}>{STATUS_LETTER[file.status]}</span> {file.path}
      </button>
      <button
        className="stage-toggle"
        aria-label={`${staged ? "Unstage" : "Stage"} ${file.path}`}
        title={staged ? "Unstage" : "Stage"}
        onClick={() =>
          act(() =>
            staged
              ? window.dryland.sourceControlUnstage(root.path, [file.path])
              : window.dryland.sourceControlStage(root.path, [file.path]),
          )
        }
      >
        {staged ? "−" : "+"}
      </button>
    </li>
  );

  return (
    <section className="source-control" aria-label="Source Control">
      <h3 className="explorer-root" title={root.path}>
        Source Control: {rootLabel(root)}
      </h3>
      {LINK_NOTE[root.link] !== null && !root.main && <p className="link-note">{LINK_NOTE[root.link]}</p>}

      <section aria-label="Staged files">
        <h4>Staged ({status.staged.length})</h4>
        <ul>{status.staged.map((file) => fileRow(file, true))}</ul>
      </section>
      <section aria-label="Changed files">
        <h4>Changes ({status.changed.length})</h4>
        <ul>{status.changed.map((file) => fileRow(file, false))}</ul>
      </section>

      <form
        className="commit-box"
        onSubmit={(event) => {
          event.preventDefault();
          commit();
        }}
      >
        <textarea
          aria-label="Commit message"
          placeholder="Commit message"
          rows={2}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
        <button type="submit" disabled={status.staged.length === 0 || message.trim() === ""}>
          Commit
        </button>
        {commitError !== null && (
          <p className="notice" role="alert">
            {commitError}
          </p>
        )}
      </form>

      <section aria-label="Commit graph">
        <h4>
          Graph{graph.base !== null && ` vs ${graph.base}`}
          {graph.base !== null && ` (${graph.ahead} ahead, ${graph.behind} behind)`}
        </h4>
        <ol className="graph">
          {graph.commits.map((commit) => (
            <li key={commit.hash} className={`graph-${commit.side}`} title={commit.hash}>
              <span aria-hidden="true">●</span> <code>{commit.hash.slice(0, 7)}</code> {commit.subject}
            </li>
          ))}
        </ol>
      </section>

      {mergeCheck !== null && <MergePanel root={root.path} check={mergeCheck} onChanged={() => void load()} />}
      {pullRequest !== null && (
        <PullRequestPanel
          root={root.path}
          section={pullRequest}
          ticket={root.ticket}
          onStartPr={onStartPr}
          onChanged={() => void load()}
        />
      )}

      {unlinked.length > 0 && (
        <section aria-label="Unlinked branches">
          <h4>Unlinked branches</h4>
          <ul>
            {unlinked.map((entry) => (
              <li key={entry.path} className="tree-row">
                <span className="tree-name" title={entry.path}>
                  {entry.branch ?? "(detached HEAD)"}
                </span>
                <button onClick={() => onShowWorktree(entry.path)}>Show</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
