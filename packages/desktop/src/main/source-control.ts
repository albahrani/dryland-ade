import {
  checkMerge,
  defaultBranch,
  describeBlocker,
  DrylandError,
  findPullRequestCached,
  forgeOf,
  mergeWorktree,
  openPullRequest,
  pruneWorktree,
  pullRequestBlockers,
  readTrackerKind,
  requestName,
  type MergeStrategy,
  type ProcessRunner,
  type WorktreeEntry,
} from "@dryland/core";
import type { ChangedFile, ChangeStatus, ExplorerRoot } from "../shared/explorer.ts";
import { isRelativeInside } from "../shared/paths.ts";
import type {
  CommitGraph,
  ActionResult,
  CommitResult,
  GraphCommit,
  MergeActionResult,
  MergeCheckView,
  PullRequestActionResult,
  PullRequestSection,
  SessionLinks,
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
export function createSourceControl(
  runner: ProcessRunner,
  projectPath: string,
  explorer: Worktrees,
  sessions: SessionLinks = { attached: () => false, handToAgent: () => false },
) {
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

  /** The branch of the linked worktree at `root`; merging and pruning are for those only. */
  async function branchOf(root: string): Promise<string> {
    const known = await explorer.knownRoot(root);
    if (known.main || known.branch === null) {
      throw new DrylandError("Only a linked worktree on a branch can be merged.", "selecting a ticket's worktree");
    }
    return known.branch;
  }

  /** The forge of the project's tracker; `null` for local markdown, which has no PR or MR. */
  const forge = async () => forgeOf(await readTrackerKind(projectPath));

  /** Runs a core action, turning its refusal into a message for the pane. */
  async function guarded<T>(
    action: () => Promise<T>,
  ): Promise<{ ok: true; value: T } | { ok: false; message: string }> {
    try {
      return { ok: true, value: await action() };
    } catch (error) {
      if (error instanceof DrylandError) return { ok: false, message: error.message };
      throw error;
    }
  }

  async function mergeCheck(root: string): Promise<MergeCheckView> {
    const check = await checkMerge(runner, projectPath, await branchOf(root));
    return { ...check, blockerMessages: check.blockers.map((b) => describeBlocker(b, check.base)) };
  }

  async function merge(root: string, strategy: MergeStrategy, cleanup: boolean): Promise<MergeActionResult> {
    const branch = await branchOf(root);
    const done = await guarded(() =>
      mergeWorktree(runner, projectPath, branch, { strategy, cleanup, sessionAttached: sessions.attached(root) }),
    );
    if (!done.ok) return done;
    if (done.value.cleanup?.removed === true) await sessions.onPruned?.(root);
    return { ok: true, result: done.value };
  }

  async function prune(root: string): Promise<ActionResult> {
    const branch = await branchOf(root);
    // The pane asks the user to confirm before calling this, so `yes` is theirs.
    const done = await guarded(() =>
      pruneWorktree(runner, projectPath, branch, { yes: true, sessionAttached: sessions.attached(root) }),
    );
    if (!done.ok) return done;
    await sessions.onPruned?.(root);
    return { ok: true };
  }

  /** Pre-types a prompt about the branch's conflicts into its session; Dryland resolves nothing itself. */
  async function handConflictsToAgent(root: string): Promise<ActionResult> {
    const check = await mergeCheck(root);
    const conflicts = check.blockers.find((b) => b.kind === "conflicts");
    if (conflicts === undefined) {
      return { ok: false, message: `Merging ${check.branch} into ${check.base} has no conflicts.` };
    }
    const prompt =
      `Merge ${check.base} into this branch and resolve the conflicts in ${conflicts.files.join(", ")}, ` +
      "then commit the merge. Do not discard either side's changes.";
    if (!sessions.handToAgent(root, prompt)) {
      return { ok: false, message: "No session is running in this worktree. Start work on the ticket to open one." };
    }
    return { ok: true };
  }

  /** The PR/MR section for the worktree at `root`; `null` on a project with no forge. */
  async function pullRequest(root: string): Promise<PullRequestSection | null> {
    const kind = await forge();
    if (kind === null) return null;
    const branch = await branchOf(root);
    const section: PullRequestSection = {
      forge: kind,
      name: requestName(kind),
      request: null,
      blockerMessages: [],
      error: null,
    };
    try {
      section.request = await findPullRequestCached(runner, projectPath, kind, branch);
      if (section.request === null) {
        const check = await checkMerge(runner, projectPath, branch);
        section.blockerMessages = pullRequestBlockers(check).map((b) => describeBlocker(b, check.base));
      }
    } catch (error) {
      if (!(error instanceof DrylandError)) throw error;
      section.error = `${error.message} ${error.nextAction}`;
    }
    return section;
  }

  async function openRequest(root: string): Promise<PullRequestActionResult> {
    const kind = await forge();
    if (kind === null) return { ok: false, message: "This project's tracker has no forge to open a PR or MR on." };
    const branch = await branchOf(root);
    try {
      return { ok: true, request: await openPullRequest(runner, projectPath, kind, branch) };
    } catch (error) {
      if (error instanceof DrylandError) return { ok: false, message: `${error.message} ${error.nextAction}` };
      throw error;
    }
  }

  return {
    pullRequest,
    openRequest,
    status,
    stage,
    unstage,
    commit,
    graph,
    unlinked,
    mergeCheck,
    merge,
    prune,
    handConflictsToAgent,
  };
}
