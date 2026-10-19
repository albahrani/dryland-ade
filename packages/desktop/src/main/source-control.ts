import { defaultBranch, DrylandError, type ProcessRunner, type WorktreeEntry } from "@dryland/core";
import type { ChangedFile, ChangeStatus, ExplorerRoot } from "../shared/explorer.ts";
import { isRelativeInside } from "../shared/paths.ts";
import type {
  CommitGraph,
  CommitResult,
  GraphCommit,
  SourceControlStatus,
  UnlinkedBranch,
} from "../shared/source-control.ts";

const MAX_BRANCH_COMMITS = 50;
const BASE_CONTEXT = 5;

const STATUS: Record<string, ChangeStatus> = { A: "added", M: "modified", D: "deleted", T: "modified" };

/** What Source Control needs of the Explorer: which worktrees the project has, and the check that a root is one. */
interface Worktrees {
  knownRoot(root: string): Promise<ExplorerRoot>;
  worktrees(): Promise<WorktreeEntry[]>;
}

/**
 * Git state and writes of a project's worktrees for the Source Control pane. A root must be a worktree git lists
 * and a path must stay inside it; every command runs in that worktree, so a commit lands there and nowhere else.
 */
export function createSourceControl(runner: ProcessRunner, projectPath: string, explorer: Worktrees) {
  // Reads skip optional locks so they never touch the index, which the pane watches; writes below do not.
  const run = async (cwd: string, args: string[], flags: string[] = ["--no-optional-locks"]) => {
    const result = await runner.run("git", [...flags, ...args], { cwd });
    return { ok: result.exitCode === 0, stdout: result.stdout, stderr: result.stderr };
  };

  async function status(root: string): Promise<SourceControlStatus> {
    await explorer.knownRoot(root);
    const { ok, stdout } = await run(root, ["status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"]);
    const staged: ChangedFile[] = [];
    const changed: ChangedFile[] = [];
    const entries = ok ? stdout.split("\0").filter(Boolean) : [];
    for (const entry of entries) {
      const index = entry[0]!;
      const tree = entry[1]!;
      const path = entry.slice(3);
      if (index === "?") {
        changed.push({ path, status: "untracked" });
        continue;
      }
      // An unmerged file (conflict) is not staged until it is resolved, so it is listed once, as changed.
      if (index === "U" || tree === "U" || (index === "A" && tree === "A") || (index === "D" && tree === "D")) {
        changed.push({ path, status: "modified" });
        continue;
      }
      if (index !== " " && index !== "!") staged.push({ path, status: STATUS[index] ?? "modified" });
      if (tree !== " " && tree !== "!") changed.push({ path, status: STATUS[tree] ?? "modified" });
    }
    const byPath = (a: ChangedFile, b: ChangedFile) => a.path.localeCompare(b.path);
    return { staged: staged.sort(byPath), changed: changed.sort(byPath) };
  }

  /** Paths from the renderer, checked, and fenced so git reads them as literal paths. */
  function checked(paths: readonly string[]): string[] {
    if (paths.length === 0 || !paths.every((path) => isRelativeInside(path))) {
      throw new DrylandError("A path to stage is outside the worktree.", "picking files inside it");
    }
    return [...paths];
  }

  async function stage(root: string, paths: readonly string[]): Promise<void> {
    await explorer.knownRoot(root);
    const result = await run(root, ["add", "-A", "--", ...checked(paths)], ["--literal-pathspecs"]);
    if (!result.ok) throw new DrylandError(result.stderr.trim() || "git add failed.", "staging the files");
  }

  async function unstage(root: string, paths: readonly string[]): Promise<void> {
    await explorer.knownRoot(root);
    // `reset` rather than `restore --staged`: it also works before the first commit.
    const result = await run(root, ["reset", "-q", "--", ...checked(paths)], ["--literal-pathspecs"]);
    if (!result.ok) throw new DrylandError(result.stderr.trim() || "git reset failed.", "unstaging the files");
  }

  async function commit(root: string, message: string): Promise<CommitResult> {
    await explorer.knownRoot(root);
    if (message.trim() === "") return { ok: false, message: "Write a commit message first." };
    const { staged } = await status(root);
    if (staged.length === 0) return { ok: false, message: "Stage a file to commit first." };
    const result = await run(root, ["commit", "-q", "-m", message], []);
    if (!result.ok) return { ok: false, message: (result.stderr || result.stdout).trim() || "git commit failed." };
    const head = await run(root, ["rev-parse", "HEAD"]);
    return { ok: true, hash: head.stdout.trim() };
  }

  async function commitsOf(root: string, args: string[]): Promise<string[]> {
    const { ok, stdout } = await run(root, ["log", "--format=%H%x00%s", ...args]);
    return ok ? stdout.split("\n").filter(Boolean) : [];
  }

  const toCommit = (line: string, side: GraphCommit["side"]): GraphCommit => {
    const [hash = "", subject = ""] = line.split("\0");
    return { hash, subject, side };
  };

  async function graph(root: string): Promise<CommitGraph> {
    await explorer.knownRoot(root);
    const mainCheckout = (await explorer.worktrees()).find((entry) => entry.main)?.path ?? projectPath;
    const base = await defaultBranch(runner, mainCheckout);
    if (base === null) {
      const lines = await commitsOf(root, ["-n", String(MAX_BRANCH_COMMITS), "HEAD"]);
      return { base, ahead: 0, behind: 0, commits: lines.map((line) => toCommit(line, "base")) };
    }
    const counts = await run(root, ["rev-list", "--left-right", "--count", `${base}...HEAD`]);
    const [behind = 0, ahead = 0] = counts.ok ? counts.stdout.trim().split(/\s+/).map(Number) : [];
    const own = await commitsOf(root, ["-n", String(MAX_BRANCH_COMMITS), `${base}..HEAD`]);
    const mergeBase = await run(root, ["merge-base", "HEAD", base]);
    const context = mergeBase.ok
      ? await commitsOf(root, [
          "-n",
          String(own.length === 0 ? BASE_CONTEXT * 2 : BASE_CONTEXT),
          mergeBase.stdout.trim(),
        ])
      : [];
    return {
      base,
      ahead,
      behind,
      commits: [...own.map((line) => toCommit(line, "branch")), ...context.map((line) => toCommit(line, "base"))],
    };
  }

  /** Worktrees neither named for a ticket nor tied to one by a commit trailer; the main checkout is never one. */
  async function unlinked(): Promise<UnlinkedBranch[]> {
    return (await explorer.worktrees())
      .filter((entry) => !entry.main && entry.link.kind === "unlinked")
      .map((entry) => ({ branch: entry.branch, path: entry.path }));
  }

  return { status, stage, unstage, commit, graph, unlinked };
}
