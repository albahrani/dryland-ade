import { execSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { describe, expect, it } from "vitest";
import { envKey } from "@dryland/core";
import { fixtureRepo } from "./fixture-repo.ts";

const CLI_BUNDLE = join(import.meta.dirname, "../../cli/dist/dryland.mjs");
const SHIPPED = join(import.meta.dirname, "../installer/bin");
const WINDOWS = process.platform === "win32";
const MAC = process.platform === "darwin";

/**
 * An install tree as electron-builder lays it out, in a directory with a space in its name: the app's executable
 * (a stand-in that runs this Node) and `resources/bin` holding the shipped launcher and the single-file CLI.
 */
function installTree(): { root: string; bin: string } {
  const root = join(mkdtempSync(join(tmpdir(), "dryland-install-")), "Dryland ADE");
  const resources = MAC ? join(root, "Dryland ADE.app", "Contents", "Resources") : join(root, "resources");
  const bin = join(resources, "bin");
  mkdirSync(bin, { recursive: true });
  if (WINDOWS) {
    copyFileSync(process.execPath, join(root, "Dryland ADE.exe"));
  } else {
    const exe = MAC ? join(root, "Dryland ADE.app", "Contents", "MacOS", "Dryland ADE") : join(root, "dryland-ade");
    mkdirSync(join(exe, ".."), { recursive: true });
    writeFileSync(exe, `#!/bin/sh\nexec '${process.execPath}' "$@"\n`);
    chmodSync(exe, 0o755);
  }
  for (const name of WINDOWS ? ["dryland.cmd"] : ["dryland"]) {
    copyFileSync(join(SHIPPED, name), join(bin, name));
    chmodSync(join(bin, name), 0o755);
  }
  copyFileSync(CLI_BUNDLE, join(bin, "dryland.mjs"));
  return { root, bin };
}

/** Runs `dryland` as found first in `dir`. The launcher itself needs no Node: it runs the app's executable. */
function run(dir: string, args: string, cwd: string): string {
  const pathKey = envKey(process.env, "PATH");
  const env = { ...process.env, [pathKey]: `${dir}${delimiter}${process.env[pathKey] ?? ""}` };
  return execSync(`dryland ${args}`, { cwd, env, encoding: "utf8", stdio: "pipe" });
}

describe("the launcher shipped in the install directory", () => {
  it("runs the bundled CLI through the app's own runtime", () => {
    const { bin } = installTree();
    const out = run(bin, "ticket list", fixtureRepo());
    expect(out).toContain("shop/02");
  });

  it.skipIf(WINDOWS)("runs through a symlink, which is how it is put on the global PATH", () => {
    const { root, bin } = installTree();
    const linkDir = join(root, "link");
    mkdirSync(linkDir);
    symlinkSync(join(bin, "dryland"), join(linkDir, "dryland"));
    expect(run(linkDir, "ticket list", fixtureRepo())).toContain("shop/02");
  });

  it("keeps the CLI's exit code", () => {
    const { bin } = installTree();
    expect(() => run(bin, "ticket show shop/99", fixtureRepo())).toThrow(/status 1|Command failed/);
  });
});
