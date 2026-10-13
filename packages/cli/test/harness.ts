import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BUNDLE = fileURLToPath(new URL("../dist/dryland.mjs", import.meta.url));

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Runs the real bundled `dryland` command. */
export function runDryland(args: string[], opts: { cwd: string }): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BUNDLE, ...args], { cwd: opts.cwd });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ stdout, stderr, exitCode: code ?? -1 }));
  });
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

/** A temp git repo with one commit; the unit later tickets run `dryland` against. */
export class TempRepo {
  private constructor(readonly path: string) {}

  static create(files: Record<string, string> = {}): TempRepo {
    const path = mkdtempSync(join(tmpdir(), "dryland-test-"));
    git(path, ["init", "--quiet", "--initial-branch=main"]);
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

  run(args: string[], cwd: string = this.path): Promise<RunResult> {
    return runDryland(args, { cwd });
  }
}
