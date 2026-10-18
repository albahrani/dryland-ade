import { describe, expect, it } from "vitest";
import { parseUnifiedDiff } from "../src/shared/diff.ts";

const SAMPLE = [
  "diff --git a/src/a.ts b/src/a.ts",
  "index 111..222 100644",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1,3 +1,3 @@ function f()",
  " keep",
  "-old",
  "+new",
  " tail",
  "@@ -10,0 +11,1 @@",
  "+added",
  "\\ No newline at end of file",
].join("\n");

describe("parseUnifiedDiff", () => {
  it("turns a diff into rows with old and new line numbers", () => {
    expect(parseUnifiedDiff(SAMPLE)).toEqual([
      { kind: "hunk", text: "@@ -1,3 +1,3 @@ function f()" },
      { kind: "context", text: "keep", oldLine: 1, newLine: 1 },
      { kind: "delete", text: "old", oldLine: 2, newLine: null },
      { kind: "add", text: "new", oldLine: null, newLine: 2 },
      { kind: "context", text: "tail", oldLine: 3, newLine: 3 },
      { kind: "hunk", text: "@@ -10,0 +11,1 @@" },
      { kind: "add", text: "added", oldLine: null, newLine: 11 },
      { kind: "note", text: "No newline at end of file" },
    ]);
  });

  it("returns no rows for an empty diff", () => {
    expect(parseUnifiedDiff("")).toEqual([]);
  });

  it("handles CRLF diffs without leaking carriage returns", () => {
    const rows = parseUnifiedDiff("@@ -1 +1 @@\r\n-a\r\n+b\r\n");
    expect(rows.map((r) => r.text)).toEqual(["@@ -1 +1 @@", "a", "b"]);
  });
});
