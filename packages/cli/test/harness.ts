import { execFileSync, spawn } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AGENT_ADAPTERS, envKey } from "@dryland/core";

const BUNDLE = fileURLToPath(new URL("../dist/dryland.mjs", import.meta.url));

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** An app directory with no running app in it, so tests never report to a real Dryland on this machine. */
const NO_APP_DIR = mkdtempSync(join(tmpdir(), "dryland-no-app-"));

/** Runs the real bundled `dryland` command. */
export function runDryland(args: string[], opts: { cwd: string; env?: Record<string, string> }): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const env: Record<string, string | undefined> = { ...process.env, DRYLAND_APP_DIR: NO_APP_DIR, ...opts.env };
    // The tests may run inside an Agent CLI session, whose id would otherwise be recorded by every ticket command.
    const sessionVars = AGENT_ADAPTERS.flatMap((adapter) => (adapter.sessionEnv === null ? [] : [adapter.sessionEnv]));
    for (const name of ["DRYLAND_PORT", "DRYLAND_TOKEN", ...sessionVars]) {
      if (opts.env?.[name] === undefined) delete env[name];
    }
    const child = spawn(process.execPath, [BUNDLE, ...args], { cwd: opts.cwd, env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ stdout, stderr, exitCode: code ?? -1 }));
  });
}

/** A directory holding a `dryland` command that runs the bundle, as the app's launcher puts one on `PATH`. */
export function drylandOnPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "dryland-launcher-"));
  writeFileSync(join(dir, "dryland"), `#!/bin/sh\nexec "${process.execPath}" "${BUNDLE}" "$@"\n`);
  chmodSync(join(dir, "dryland"), 0o755);
  writeFileSync(join(dir, "dryland.cmd"), `@"${process.execPath}" "${BUNDLE}" %*\r\n`);
  return dir;
}

/** A fresh empty directory under the temp dir. */
export function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export const WINDOWS = process.platform === "win32";

/**
 * A `PATH` env holding `dirs` and nothing else but the directory of `git`, which dryland needs.
 * Unlike filtering the machine's `PATH`, nothing else on it can leak in.
 */
export function isolatedPath(...dirs: string[]): Record<string, string> {
  const key = envKey(process.env, "PATH");
  const gitName = WINDOWS ? "git.exe" : "git";
  const gitDir = (process.env[key] ?? "").split(delimiter).find((dir) => dir !== "" && existsSync(join(dir, gitName)));
  if (gitDir === undefined) throw new Error("git is not on PATH");
  // git must stay reachable, so a dryland beside it would make the "not on PATH" checks pass by accident.
  const stray = ["dryland", "dryland.cmd", "dryland.exe", "dryland.bat"].find((n) => existsSync(join(gitDir, n)));
  if (stray !== undefined)
    throw new Error(`${stray} sits in git's directory ${gitDir}; isolatedPath cannot exclude it`);
  return { [key]: [...dirs, gitDir].join(delimiter) };
}

/**
 * A directory holding a stand-in `name` CLI whose `--version` succeeds and whose `auth status` exits with
 * `authExit`, with the env that makes it behave.
 */
export function stubCli(name: string, authExit: number): { dir: string; env: Record<string, string> } {
  const dir = tempDir(`dryland-stub-${name}-`);
  if (!WINDOWS) {
    writeFileSync(join(dir, name), `#!/bin/sh\n[ "$1" = auth ] && exit ${authExit}\nexit 0\n`);
    chmodSync(join(dir, name), 0o755);
    return { dir, env: {} };
  }
  // CreateProcess only finds .exe files, so a copy of node stands in and a preload script picks its exit code.
  copyFileSync(process.execPath, join(dir, `${name}.exe`));
  const preload = join(dir, "stub.cjs");
  writeFileSync(preload, `if (process.argv.some((a) => a.endsWith("auth"))) process.exit(${authExit});\n`);
  return { dir, env: { NODE_OPTIONS: `--require=${preload.replaceAll("\\", "/")}` } };
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

/** A bare repo (no working tree) and its path. */
export function createBareRepo(): string {
  const path = mkdtempSync(join(tmpdir(), "dryland-bare-"));
  git(path, ["init", "--quiet", "--bare", "--initial-branch=main"]);
  return path;
}

/** A temp git repo with one commit; the unit later tickets run `dryland` against. */
export class TempRepo {
  private constructor(readonly path: string) {}

  /** `separateGitDir` keeps the git directory outside the working tree, as `git init --separate-git-dir` does. */
  static create(files: Record<string, string> = {}, opts: { separateGitDir?: boolean } = {}): TempRepo {
    const path = mkdtempSync(join(tmpdir(), "dryland-test-"));
    const initArgs = ["init", "--quiet", "--initial-branch=main"];
    if (opts.separateGitDir) initArgs.push(`--separate-git-dir=${mkdtempSync(join(tmpdir(), "dryland-gitdir-"))}`);
    git(path, initArgs);
    git(path, ["config", "user.name", "Dryland Test"]);
    git(path, ["config", "user.email", "test@dryland.invalid"]);
    git(path, ["config", "commit.gpgsign", "false"]);
    git(path, ["config", "core.autocrlf", "false"]);
    const repo = new TempRepo(path);
    repo.write(".gitkeep", "");
    for (const [file, content] of Object.entries(files)) repo.write(file, content);
    repo.commitAll("Initial commit");
    return repo;
  }

  write(file: string, content: string): void {
    const full = join(this.path, file);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }

  read(file: string): string {
    return readFileSync(join(this.path, file), "utf8");
  }

  git(...args: string[]): string {
    return git(this.path, args);
  }

  commitAll(message: string): void {
    git(this.path, ["add", "-A"]);
    git(this.path, ["commit", "--quiet", "-m", message]);
  }

  /** Subjects of all commits, newest first. */
  log(): string[] {
    return git(this.path, ["log", "--format=%s"]).split("\n");
  }

  /** Adds a linked worktree on a new branch and returns its path. */
  addWorktree(branch: string): string {
    const dir = mkdtempSync(join(tmpdir(), "dryland-wt-"));
    rmSync(dir, { recursive: true });
    git(this.path, ["worktree", "add", "--quiet", "-b", branch, dir]);
    return dir;
  }

  run(args: string[], cwd: string = this.path, env: Record<string, string> = {}): Promise<RunResult> {
    return runDryland(args, { cwd, env });
  }
}
