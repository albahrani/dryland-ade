import { useEffect, useMemo, useState } from "react";
import type { FileContent } from "../../shared/explorer.ts";
import { type DiffRow, parseUnifiedDiff } from "../../shared/diff.ts";
import type { DiffRef, FileRef } from "../../shared/tabs.ts";
import { highlightCode } from "./highlight.ts";

/** Runs `load` again whenever `revision` changes, so the tab follows the files on disk. */
function useLoaded<T>(load: () => Promise<T>, key: string, revision: number): T | "error" | null {
  const [value, setValue] = useState<T | "error" | null>(null);
  useEffect(() => {
    let current = true;
    load().then(
      (next) => current && setValue(next),
      () => current && setValue("error"),
    );
    return () => {
      current = false;
    };
    // `load` is made fresh each render; its inputs are the key and the revision.
  }, [key, revision]);
  return value;
}

const label = (path: string) => path.split("/").at(-1) ?? path;

/** A file of a worktree, read-only, highlighted when its language is known. */
export function FileTab({ item, revision }: { item: FileRef; revision: number }) {
  const content = useLoaded<FileContent>(
    () => window.dryland.explorerRead(item.root, item.path),
    `${item.root}|${item.path}`,
    revision,
  );
  const html = useMemo(
    () =>
      content !== null && content !== "error" && content.kind === "text"
        ? highlightCode(content.text, item.path)
        : null,
    [content, item.path],
  );
  return (
    <section className="file-tab" aria-label={`File ${item.path}`}>
      <h2 title={item.path}>{item.path}</h2>
      {content === null && <p className="empty">Loading...</p>}
      {content === "error" && <p className="notice">Could not read {item.path}.</p>}
      {content !== null && content !== "error" && content.kind === "missing" && (
        <p className="empty">{label(item.path)} is gone from this worktree.</p>
      )}
      {content !== null && content !== "error" && content.kind === "binary" && (
        <p className="empty">{label(item.path)} is a binary file.</p>
      )}
      {content !== null && content !== "error" && content.kind === "text" && (
        <>
          {content.truncated && <p className="notice">Only the start of this large file is shown.</p>}
          {html === null ? (
            <pre className="code">{content.text}</pre>
          ) : (
            <pre className="code">
              <code className="hljs" dangerouslySetInnerHTML={{ __html: html }} />
            </pre>
          )}
        </>
      )}
    </section>
  );
}

function DiffLine({ row }: { row: DiffRow }) {
  if (row.kind === "hunk" || row.kind === "note") {
    return <div className={`diff-row diff-${row.kind}`}>{row.text}</div>;
  }
  const sign = row.kind === "add" ? "+" : row.kind === "delete" ? "-" : " ";
  return (
    <div className={`diff-row diff-${row.kind}`}>
      <span className="diff-num">{row.oldLine ?? ""}</span>
      <span className="diff-num">{row.newLine ?? ""}</span>
      <span className="diff-text">
        {sign}
        {row.text}
      </span>
    </div>
  );
}

/** A changed file's diff against its worktree's base. */
export function DiffTab({ item, revision }: { item: DiffRef; revision: number }) {
  const diff = useLoaded<string>(
    () => window.dryland.explorerDiff(item.root, item.path),
    `${item.root}|${item.path}`,
    revision,
  );
  const rows = useMemo(() => (diff === null || diff === "error" ? [] : parseUnifiedDiff(diff)), [diff]);
  return (
    <section className="file-tab" aria-label={`Diff ${item.path}`}>
      <h2 title={item.path}>{item.path} (changes)</h2>
      {diff === null && <p className="empty">Loading...</p>}
      {diff === "error" && <p className="notice">Could not diff {item.path}.</p>}
      {diff !== null && diff !== "error" && rows.length === 0 && (
        <p className="empty">No changes in {label(item.path)} against the base.</p>
      )}
      <div className="diff" role="table" aria-label="Diff">
        {rows.map((row, i) => (
          <DiffLine key={i} row={row} />
        ))}
      </div>
    </section>
  );
}
