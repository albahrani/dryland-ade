import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("../../../scripts/edit.mjs", import.meta.url));

/** Writes `files` and a spec into a temp directory and runs the script there. */
function run(files: Record<string, string>, edits: unknown[], ...flags: string[]) {
  const cwd = mkdtempSync(join(tmpdir(), "dryland-edit-"));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(cwd, name), content);
  writeFileSync(join(cwd, "spec.json"), JSON.stringify({ edits }));
  const result = spawnSync(process.execPath, [script, "spec.json", ...flags], { cwd, encoding: "utf8" });
  const read = (name: string) => readFileSync(join(cwd, name), "utf8");
  return { ...result, read };
}

describe("scripts/edit.mjs", () => {
  it("replaces every literal occurrence, keeping backslashes and quotes as written", () => {
    const result = run({ "a.txt": 'x = "\\d+" ; x = "\\d+"\n' }, [
      { file: "a.txt", find: '"\\d+"', replace: '"\\w+"' },
    ]);
    expect(result.status).toBe(0);
    expect(result.read("a.txt")).toBe('x = "\\w+" ; x = "\\w+"\n');
  });

  it("replaces with a regular expression and capture groups", () => {
    const result = run({ "a.txt": "foo(1) foo(22)\n" }, [
      { file: "a.txt", find: "foo\\((\\d+)\\)", replace: "bar<$1>", regex: true },
    ]);
    expect(result.status).toBe(0);
    expect(result.read("a.txt")).toBe("bar<1> bar<22>\n");
  });

  it("applies edits to one file in order", () => {
    const result = run({ "a.txt": "a\n" }, [
      { file: "a.txt", find: "a", replace: "b" },
      { file: "a.txt", find: "b", replace: "c" },
    ]);
    expect(result.read("a.txt")).toBe("c\n");
  });

  it("writes nothing when an edit finds no match, and names the edit", () => {
    const result = run({ "a.txt": "keep\n", "b.txt": "keep\n" }, [
      { file: "a.txt", find: "keep", replace: "changed" },
      { file: "b.txt", find: "absent", replace: "x" },
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("edit 2 (b.txt): no match");
    expect(result.read("a.txt")).toBe("keep\n");
  });

  it("fails when the match count differs from the expected one", () => {
    const result = run({ "a.txt": "x x x\n" }, [{ file: "a.txt", find: "x", replace: "y", count: 2 }]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("expected 2 matches, found 3");
    expect(result.read("a.txt")).toBe("x x x\n");
  });

  it("leaves files alone on a dry run", () => {
    const result = run({ "a.txt": "x\n" }, [{ file: "a.txt", find: "x", replace: "y" }], "--dry-run");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("1 replaced");
    expect(result.read("a.txt")).toBe("x\n");
  });
});
