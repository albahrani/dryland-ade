import { useEffect, useRef, useState } from "react";
import {
  type ChangedFile,
  type DirectoryListing,
  type ExplorerRoot,
  type RootHint,
  rootLabel,
} from "../../shared/explorer.ts";

/** How often the changed-files list asks git again, for edits in directories the tree has closed. */
const CHANGES_POLL_MS = 2000;

const STATUS_LETTER = { added: "A", modified: "M", deleted: "D", untracked: "U" } as const;

/**
 * The file tree of the worktree a selection belongs to, and the files changed in it. Directories load as they are
 * opened, and only the open ones are watched, so a huge or ignored directory costs nothing until it is asked for.
 */
export function Explorer({
  hint,
  projectView,
  revision,
  watchedDirs,
  onOpenFile,
  onOpenDiff,
}: {
  hint: RootHint;
  /** The project as last read; a new one may mean a worktree was made or removed, so the root is resolved again. */
  projectView: unknown;
  /** Bumps when watched files change on disk. */
  revision: number;
  /** Directories of open file tabs, watched along with the open ones; relative to the root. */
  watchedDirs: (root: string) => string[];
  onOpenFile: (root: string, path: string) => void;
  onOpenDiff: (root: string, path: string) => void;
}) {
  const [root, setRoot] = useState<ExplorerRoot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [listings, setListings] = useState<ReadonlyMap<string, DirectoryListing>>(new Map());
  const [changes, setChanges] = useState<readonly ChangedFile[]>([]);
  const hintKey = JSON.stringify(hint);
  const latestHint = useRef(hint);
  latestHint.current = hint;
  // The worktree whose tree is loaded, so a change of worktree starts the tree closed and a refresh keeps it.
  const shownRoot = useRef<string | null>(null);

  // A new selection (or a project change) resolves its worktree again, and starts the tree closed.
  useEffect(() => {
    let current = true;
    window.dryland.explorerRoot(latestHint.current).then(
      (next) => {
        if (!current) return;
        setError(null);
        if (shownRoot.current !== next.path) {
          shownRoot.current = next.path;
          setExpanded(new Set());
          setListings(new Map());
          setChanges([]);
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
  const expandedKey = [...expanded].sort().join("\n");
  const extraKey = rootPath === undefined ? "" : watchedDirs(rootPath).join("\n");
  // Reload what is open whenever the worktree, the open directories, or the files on disk change.
  useEffect(() => {
    if (rootPath === undefined) return;
    let current = true;
    const dirs = ["", ...expanded];
    void Promise.all(
      dirs.map((dir) =>
        window.dryland.explorerList(rootPath, dir).then(
          (listing) => [dir, listing] as const,
          () => null, // a directory that vanished drops out below
        ),
      ),
    ).then((loaded) => {
      if (!current) return;
      const next = new Map<string, DirectoryListing>();
      for (const entry of loaded) if (entry !== null) next.set(entry[0], entry[1]);
      setListings(next);
    });
    window.dryland.explorerChanges(rootPath).then(
      (next) => current && setChanges(next),
      () => current && setChanges([]),
    );
    void window.dryland.explorerWatch(rootPath, [...new Set([...dirs, ...extraKey.split("\n").filter(Boolean)])]);
    return () => {
      current = false;
    };
  }, [rootPath, expandedKey, extraKey, revision]);

  // Only open directories are watched, so a file edited in a closed one is found by asking git now and then.
  useEffect(() => {
    if (rootPath === undefined) return;
    const timer = setInterval(() => {
      if (document.hidden) return;
      window.dryland.explorerChanges(rootPath).then(
        (next) => setChanges((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next)),
        () => undefined,
      );
    }, CHANGES_POLL_MS);
    return () => clearInterval(timer);
  }, [rootPath]);

  if (error !== null)
    return (
      <p className="notice" role="alert">
        {error}
      </p>
    );
  if (root === null) return <p className="empty">Open a git repo to browse its files.</p>;

  const changeOf = new Map(changes.map((change) => [change.path, change.status]));
  const toggle = (dir: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(dir)) next.add(dir);
      return next;
    });

  const renderDir = (dir: string, depth: number) => {
    const listing = listings.get(dir);
    if (listing === undefined) return null;
    return (
      <ul className="tree" role={depth === 0 ? "tree" : "group"}>
        {listing.entries.map((entry) => {
          const open = expanded.has(entry.path);
          const status = changeOf.get(entry.path);
          return (
            <li key={entry.path} role="treeitem" aria-expanded={entry.kind === "dir" ? open : undefined}>
              <div className={`tree-row${entry.ignored ? " ignored" : ""}`} style={{ paddingLeft: depth * 12 }}>
                {entry.kind === "dir" ? (
                  <button
                    className="tree-name"
                    disabled={entry.ignored}
                    title={entry.ignored ? "Ignored by git" : undefined}
                    onClick={() => toggle(entry.path)}
                  >
                    {open ? "▾" : "▸"} {entry.name}
                  </button>
                ) : (
                  <button className="tree-name tree-file" onClick={() => onOpenFile(root.path, entry.path)}>
                    {entry.name}
                  </button>
                )}
                {status !== undefined && entry.kind === "file" && (
                  <button
                    className={`change change-${status}`}
                    title={`${status}: open diff`}
                    aria-label={`Open diff of ${entry.path}`}
                    onClick={() => onOpenDiff(root.path, entry.path)}
                  >
                    {STATUS_LETTER[status]}
                  </button>
                )}
              </div>
              {entry.kind === "dir" && open && renderDir(entry.path, depth + 1)}
            </li>
          );
        })}
        {listing.truncated && <li className="empty">More files than are listed.</li>}
      </ul>
    );
  };

  return (
    <section className="explorer" aria-label="Explorer">
      <h3 className="explorer-root" title={root.path}>
        {rootLabel(root)}
      </h3>
      {changes.length > 0 && (
        <section className="explorer-changes" aria-label="Changed files">
          <h4>Changes ({changes.length})</h4>
          <ul>
            {changes.map((change) => (
              <li key={change.path}>
                <button
                  className="tree-name"
                  title={`${change.status}: open diff`}
                  onClick={() => onOpenDiff(root.path, change.path)}
                >
                  <span className={`change change-${change.status}`}>{STATUS_LETTER[change.status]}</span> {change.path}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {renderDir("", 0)}
    </section>
  );
}
