/** One line of a diff as the diff tab shows it. */
export type DiffRow =
  | { kind: "hunk"; text: string }
  | { kind: "context"; text: string; oldLine: number; newLine: number }
  | { kind: "delete"; text: string; oldLine: number; newLine: null }
  | { kind: "add"; text: string; oldLine: null; newLine: number }
  | { kind: "note"; text: string };

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Reads `git diff` output for one file into rows; the file header lines before the first hunk are dropped. */
export function parseUnifiedDiff(diff: string): DiffRow[] {
  const rows: DiffRow[] = [];
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;
  for (const line of diff.replace(/\r\n/g, "\n").split("\n")) {
    const hunk = HUNK.exec(line);
    if (hunk !== null) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      inHunk = true;
      rows.push({ kind: "hunk", text: line });
    } else if (!inHunk || line === "") {
      continue;
    } else if (line.startsWith("\\")) {
      rows.push({ kind: "note", text: line.slice(2) });
    } else if (line.startsWith("+")) {
      rows.push({ kind: "add", text: line.slice(1), oldLine: null, newLine: newLine++ });
    } else if (line.startsWith("-")) {
      rows.push({ kind: "delete", text: line.slice(1), oldLine: oldLine++, newLine: null });
    } else {
      rows.push({ kind: "context", text: line.slice(1), oldLine: oldLine++, newLine: newLine++ });
    }
  }
  return rows;
}
