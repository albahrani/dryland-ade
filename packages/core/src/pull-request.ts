import { DrylandError } from "./errors.ts";
import { ghRun } from "./github-backend.ts";
import { glabRequired, glabRun, PROJECT } from "./gitlab-backend.ts";
import { checkMerge, describeBlocker, type MergeBlocker, type MergeCheck } from "./merge.ts";
import type { ProcessRunner } from "./process-runner.ts";
import type { TrackerKind } from "./tracker.ts";
import { gitIn } from "./worktree.ts";

/** A forge Dryland opens a pull or merge request on, through the user's own `gh` or `glab` login. */
export type Forge = "github" | "gitlab";

export type PullRequestState = "open" | "merged" | "closed";

/** A PR (GitHub) or MR (GitLab) as the section shows it. */
export interface PullRequest {
  number: number;
  state: PullRequestState;
  url: string;
}

/** The forge a tracker lives on; local markdown has none, so it never opens a PR or MR. */
export function forgeOf(kind: TrackerKind): Forge | null {
  return kind === "local-markdown" ? null : kind;
}

/** What the forge calls its request: a PR on GitHub, an MR on GitLab. */
export const requestName = (forge: Forge): "PR" | "MR" => (forge === "github" ? "PR" : "MR");

const GITHUB_STATE: Record<string, PullRequestState> = { OPEN: "open", MERGED: "merged", CLOSED: "closed" };
const GITLAB_STATE: Record<string, PullRequestState> = { opened: "open", merged: "merged", closed: "closed" };

interface GithubPr {
  number: number;
  state: string;
  url: string;
}

interface GitlabMr {
  iid: number;
  state: string;
  web_url: string;
}

/** The newest open or merged PR or MR whose source is `branch`; a closed one does not count. `null` when none. */
export async function findPullRequest(
  runner: ProcessRunner,
  cwd: string,
  forge: Forge,
  branch: string,
): Promise<PullRequest | null> {
  if (forge === "github") {
    const out = await ghRun(runner, cwd, [
      "pr",
      "list",
      "--head",
      branch,
      "--state",
      "all",
      "--json",
      "number,state,url",
      "--limit",
      "10",
    ]);
    const found = (JSON.parse(out) as GithubPr[]).find((pr) => GITHUB_STATE[pr.state] !== "closed");
    return found === undefined
      ? null
      : { number: found.number, state: GITHUB_STATE[found.state] ?? "open", url: found.url };
  }
  const path = `${PROJECT}/merge_requests?source_branch=${encodeURIComponent(branch)}&state=all&per_page=20`;
  const found = ((await glabRequired(runner, cwd, ["api", path])) as GitlabMr[]).find(
    (mr) => GITLAB_STATE[mr.state] !== "closed",
  );
  return found === undefined
    ? null
    : { number: found.iid, state: GITLAB_STATE[found.state] ?? "open", url: found.web_url };
}

/** How long a lookup stands: the panes ask on every refresh, and a PR changes on human timescales. */
const LOOKUP_TTL_MS = 30_000;

const lookupKey = (cwd: string, forge: Forge, branch: string): string => `${cwd}|${forge}|${branch}`;

const lookups = new Map<string, { at: number; request: PullRequest | null }>();

/**
 * `findPullRequest`, remembered per branch for a short while so a polling pane does not call the forge every few
 * seconds. A failure is never remembered. `now` is the clock, injectable for tests.
 */
export async function findPullRequestCached(
  runner: ProcessRunner,
  cwd: string,
  forge: Forge,
  branch: string,
  now: () => number = Date.now,
): Promise<PullRequest | null> {
  const key = lookupKey(cwd, forge, branch);
  const hit = lookups.get(key);
  if (hit !== undefined && now() - hit.at < LOOKUP_TTL_MS) return hit.request;
  const request = await findPullRequest(runner, cwd, forge, branch);
  lookups.set(key, { at: now(), request });
  return request;
}

/** Drops every remembered lookup, after an action that changes what the forge would say. */
export const forgetPullRequests = (): void => lookups.clear();

/** The dry-run blockers that stop a PR or MR: the main checkout's state does not count, since nothing merges there. */
export const pullRequestBlockers = (check: MergeCheck): MergeBlocker[] =>
  check.blockers.filter((b) => b.kind !== "dirty-main" && b.kind !== "main-off-default");

/**
 * Opens a PR or MR for the worktree branch and returns it. The forge CLI is asked first, so a missing or logged-out
 * `gh`/`glab` is reported before anything is pushed; then the dry-run checks apply. An existing request is returned as it is.
 */
export async function openPullRequest(
  runner: ProcessRunner,
  cwd: string,
  forge: Forge,
  branch: string,
): Promise<PullRequest> {
  const existing = await findPullRequest(runner, cwd, forge, branch);
  if (existing !== null) return existing;

  const check = await checkMerge(runner, cwd, branch);
  const blockers = pullRequestBlockers(check);
  if (blockers.length > 0) {
    throw new DrylandError(
      `Will not open a ${requestName(forge)} for ${branch}: ${blockers.map((b) => describeBlocker(b, check.base)).join("; ")}.`,
      "Clear what is listed, then open it again.",
    );
  }

  await gitIn(runner, cwd, ["push", "-u", "origin", branch], `pushing ${branch}`);
  if (forge === "github") {
    await ghRun(runner, cwd, ["pr", "create", "--head", branch, "--base", check.base, "--fill"]);
  } else {
    await glabRun(runner, cwd, [
      "mr",
      "create",
      "--source-branch",
      branch,
      "--target-branch",
      check.base,
      "--fill",
      "--yes",
    ]);
  }
  forgetPullRequests();
  const created = await findPullRequest(runner, cwd, forge, branch);
  if (created === null) {
    throw new DrylandError(
      `The ${requestName(forge)} for ${branch} was not found afterwards.`,
      `Check the ${forge === "github" ? "GitHub" : "GitLab"} page of the repo.`,
    );
  }
  lookups.set(lookupKey(cwd, forge, branch), { at: Date.now(), request: created });
  return created;
}
