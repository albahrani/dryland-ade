import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { createWorktree, envKey, nodeProcessRunner } from "@dryland/core";
import { describe, expect, it } from "vitest";
import { writeLauncher } from "../src/main/launcher.ts";
import { fixtureRepo, ticket } from "./fixture-repo.ts";

// Built by the CLI's global setup before any test runs.
const CLI_BUNDLE = join(import.meta.dirname, "../../cli/dist/dryland.mjs");

/** A launcher in a directory with a space in its name, running the real CLI bundle with this Node as the runtime. */
function launcher(): string {
  const root = join(mkdtempSync(join(tmpdir(), "dryland-launcher-")), "Dryland App");
  mkdirSync(root);
  const cli = join(root, "dryland cli.mjs");
  copyFileSync(CLI_BUNDLE, cli);
  const dir = join(root, "bin");
  writeLauncher(dir, { runtime: process.execPath, cli });
  return dir;
}

/** Runs `command` in the user's shell, with `dir` first on `PATH`, the way a session's CLI would. */
function inShell(command: string, cwd: string, dir: string): string {
  const pathKey = envKey(process.env, "PATH");
  const env = { ...process.env, [pathKey]: `${dir}${delimiter}${process.env[pathKey] ?? ""}` };
  return execSync(command, { cwd, env, encoding: "utf8", stdio: "pipe" });
}

describe("the dryland launcher", () => {
  it("runs as `dryland` from a worktree and reports the main checkout's tickets", async () => {
    const repo = fixtureRepo();
    const { path } = await createWorktree(nodeProcessRunner, repo, { ticket: "shop/02" });
    // Uncommitted, so only the main checkout has it.
    writeFileSync(join(repo, ".scratch/shop/issues/03-cart.md"), ticket("Build the basket", "Type: task"));

    const out = inShell("dryland ticket list", path, launcher());
    expect(out).toContain("shop/02");
    expect(out).toContain("Build the basket");
  });

  it("passes arguments through and keeps the CLI's exit code", () => {
    const repo = fixtureRepo();
    const dir = launcher();
    expect(inShell('dryland ticket show "shop/02"', repo, dir)).toContain("Grill the cart");
    let status: number | null = null;
    try {
      inShell("dryland ticket show shop/99", repo, dir);
    } catch (error) {
      status = (error as { status: number | null }).status;
    }
    expect(status).toBe(1);
  });

  it("runs an Agent CLI typed by hand through its shim: the real binary behind the shim, hooks injected", () => {
    const root = mkdtempSync(join(tmpdir(), "dryland-shim-"));
    const dir = join(root, "bin");
    writeLauncher(dir, { runtime: process.execPath, cli: CLI_BUNDLE }, [{ id: "claude-code", binary: "claude" }]);
    // The real CLI sits further along PATH than the shim; it reports what it was run with.
    const real = join(root, "real");
    mkdirSync(real);
    writeFileSync(
      join(real, process.platform === "win32" ? "claude.cmd" : "claude"),
      process.platform === "win32"
        ? "@echo off\r\necho AGENT=%DRYLAND_AGENT% ARGS=%*\r\n"
        : '#!/bin/sh\necho "AGENT=$DRYLAND_AGENT ARGS=$*"\n',
      { mode: 0o755 },
    );
    const hooksDir = join(root, "hooks");
    const pathKey = envKey(process.env, "PATH");
    const env = {
      ...process.env,
      [pathKey]: [dir, real, process.env[pathKey] ?? ""].join(delimiter),
      DRYLAND_HOOKS_DIR: hooksDir,
    };

    const out = execSync("claude --resume abc", { cwd: root, env, encoding: "utf8", stdio: "pipe" });

    expect(out).toContain("AGENT=claude-code");
    // The batch shim quotes the path, the shell one does not.
    expect(out.replaceAll('"', "")).toContain(`--resume abc --settings ${join(hooksDir, "claude-code.json")}`);
  });

  it("writes only the shims when the app ships its own launcher", () => {
    const dir = join(mkdtempSync(join(tmpdir(), "dryland-launcher-")), "bin");
    writeLauncher(dir, { runtime: process.execPath, cli: CLI_BUNDLE }, [{ id: "claude-code", binary: "claude" }], {
      launcher: false,
    });
    expect(existsSync(join(dir, "dryland"))).toBe(false);
    expect(existsSync(join(dir, "dryland.cmd"))).toBe(false);
    expect(existsSync(join(dir, "claude"))).toBe(true);
    expect(existsSync(join(dir, "claude.cmd"))).toBe(true);
  });

  it("replaces a launcher left by an earlier version", () => {
    const dir = join(mkdtempSync(join(tmpdir(), "dryland-launcher-")), "bin");
    writeLauncher(dir, { runtime: process.execPath, cli: join(dir, "gone.mjs") });
    writeLauncher(dir, { runtime: process.execPath, cli: CLI_BUNDLE });
    expect(inShell("dryland ticket list", fixtureRepo(), dir)).toContain("shop/02");
  });
});
