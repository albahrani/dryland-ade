import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { removeScopedTmp, scopeTmp } from "./scoped-tmp.ts";

describe("the temp directory of a test run", () => {
  it("is the one the tests' own mkdtemp calls land in, so the global teardown removes what they leave", () => {
    const scoped = process.env.DRYLAND_TEST_TMP;
    expect(scoped).toBeTruthy();
    const made = mkdtempSync(join(tmpdir(), "dryland-test-"));
    expect(relative(scoped as string, made).startsWith("..")).toBe(false);
  });
});

describe("scoping the temp directory", () => {
  const saved = { ...process.env };
  afterEach(() => {
    for (const key of ["DRYLAND_TEST_TMP", "TMPDIR", "TEMP", "TMP"]) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("points the OS temp directory at a folder of its own and deletes it with everything inside", () => {
    delete process.env.DRYLAND_TEST_TMP;
    const dir = scopeTmp();
    expect(tmpdir()).toBe(dir);
    const inner = mkdtempSync(join(tmpdir(), "dryland-leftover-"));
    writeFileSync(join(inner, "file"), "x");
    removeScopedTmp();
    expect(existsSync(dir)).toBe(false);
  });

  it("reuses the folder a parent process scoped", () => {
    const first = scopeTmp();
    expect(scopeTmp()).toBe(first);
  });
});
