import {
  blockGithubTicket,
  claimGithubTicket,
  commentOnGithubTicket,
  createGithubTicket,
  indexGithubMap,
  releaseGithubTicket,
  resolveGithubTicket,
  triageGithubTicket,
} from "./github-write.ts";
import {
  blockGitlabTicket,
  claimGitlabTicket,
  commentOnGitlabTicket,
  createGitlabTicket,
  indexGitlabMap,
  releaseGitlabTicket,
  resolveGitlabTicket,
  triageGitlabTicket,
} from "./gitlab-write.ts";
import { findMainCheckout } from "./main-checkout.ts";
import type { MapIndexEntry } from "./map-write.ts";
import type { MapModel } from "./map.ts";
import type { ProcessRunner } from "./process-runner.ts";
import type { TicketWriteResult } from "./tickets.ts";
import { readTrackerKind } from "./tracker.ts";
import type { TrackerCreateInput } from "./tracker-rules.ts";

/**
 * The writes of a remote tracker, made through its CLI (`gh`, `glab`); no file is written and no commit is made.
 * Each takes the main checkout that `remoteBackend` found. Local markdown is not a backend: its writes go through
 * `writeTracker`, which takes the lock and commits.
 */
export interface RemoteBackend {
  create(runner: ProcessRunner, cwd: string, input: TrackerCreateInput): Promise<TicketWriteResult>;
  claim(runner: ProcessRunner, cwd: string, reference: string): Promise<TicketWriteResult & { alreadyHeld: boolean }>;
  release(runner: ProcessRunner, cwd: string, reference: string): Promise<TicketWriteResult>;
  resolve(runner: ProcessRunner, cwd: string, reference: string, answer: string): Promise<TicketWriteResult>;
  block(
    runner: ProcessRunner,
    cwd: string,
    reference: string,
    change: { add: string[]; remove: string[] },
  ): Promise<TicketWriteResult>;
  comment(runner: ProcessRunner, cwd: string, reference: string, comment: string): Promise<TicketWriteResult>;
  triage(runner: ProcessRunner, cwd: string, reference: string, role: string): Promise<TicketWriteResult>;
  indexMap(
    runner: ProcessRunner,
    cwd: string,
    name: string,
    entry: MapIndexEntry,
  ): Promise<{ value: MapModel; warnings: string[] }>;
}

const github: RemoteBackend = {
  create: createGithubTicket,
  claim: claimGithubTicket,
  release: releaseGithubTicket,
  resolve: resolveGithubTicket,
  block: blockGithubTicket,
  comment: commentOnGithubTicket,
  triage: triageGithubTicket,
  indexMap: indexGithubMap,
};

const gitlab: RemoteBackend = {
  create: createGitlabTicket,
  claim: claimGitlabTicket,
  release: releaseGitlabTicket,
  resolve: resolveGitlabTicket,
  block: blockGitlabTicket,
  comment: commentOnGitlabTicket,
  triage: triageGitlabTicket,
  indexMap: indexGitlabMap,
};

/** The backend of the repo's tracker and the main checkout to run it in; `null` for local markdown. */
export async function remoteBackend(
  runner: ProcessRunner,
  cwd: string,
): Promise<{ backend: RemoteBackend; checkout: string } | null> {
  const checkout = await findMainCheckout(runner, cwd);
  // A repo whose tracker doc is missing keeps being treated as local markdown.
  const kind = await readTrackerKind(checkout).catch(() => "local-markdown" as const);
  if (kind === "github") return { backend: github, checkout };
  if (kind === "gitlab") return { backend: gitlab, checkout };
  return null;
}
