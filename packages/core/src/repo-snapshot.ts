import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { readEfforts } from "./efforts.ts";
import { exists } from "./env-fs.ts";
import { DrylandError } from "./errors.ts";
import {
  type EffortSnapshot,
  type GitState,
  holdsClaim,
  type PausedSessionSnapshot,
  type RepoSnapshot,
  type SessionSnapshot,
  type WorktreeGitState,
} from "./next-step.ts";
import type { ProcessRunner } from "./process-runner.ts";
import { findPullRequest, type Forge, forgeOf, type PullRequest } from "./pull-request.ts";
import { readSessionIndex, sessionsOf } from "./session-index.ts";
import type { Ticket } from "./ticket.ts";
import { readTrackerKind, TRACKER_DOC } from "./tracker.ts";
import { readTicketWorktreeStates, type TicketWorktreeState } from "./worktree.ts";

/**
 * Reads the artifacts under `mainCheckout` into the snapshot the next-step rules take. `efforts` saves a second
 * pass over `.scratch/` when the caller has read them already. `sessions` are the live Dryland sessions, which only
 * the app knows; `null` leaves them unknown.
 */
export async function readRepoSnapshot(
  runner: ProcessRunner,
  mainCheckout: string,
  tickets: Ticket[],
  efforts?: EffortSnapshot[],
  sessions: SessionSnapshot[] | null = null,
): Promise<RepoSnapshot> {
  const adrs = await readdir(join(mainCheckout, "docs", "adr")).catch(() => []);
  return {
    setupConfigPresent: await exists(join(mainCheckout, TRACKER_DOC)),
    efforts: efforts ?? (await readEfforts(mainCheckout)),
    tickets,
    hasGlossary: await exists(join(mainCheckout, "GLOSSARY.md")),
    adrCount: adrs.filter((file) => file.endsWith(".md")).length,
    git: await readGitState(runner, mainCheckout, tickets),
    sessions:
      sessions === null ? null : [...sessions, ...(await pausedSessions(runner, mainCheckout, tickets, sessions))],
    // Not fed yet: skill setup with the Compatibility verdict is ticket 66. `null` means unknown, so no rule is
    // disabled meanwhile.
    skillSetup: null,
  };
}

const PAUSED_WAS = { waiting: "waiting", running: "interrupted" } as const;

/**
 * The claimed tickets the session index knows a session for while no live session works on them: those sessions are
 * paused (ADR 0010). The newest indexed session stands for the ticket. A repo without a session index has none.
 */
async function pausedSessions(
  runner: ProcessRunner,
  mainCheckout: string,
  tickets: Ticket[],
  live: SessionSnapshot[],
): Promise<PausedSessionSnapshot[]> {
  const index = await readSessionIndex(runner, mainCheckout)
    .then((read) => read.index)
    .catch((error: unknown) => {
      if (error instanceof DrylandError) return null;
      throw error;
    });
  if (index === null) return [];
  return tickets.flatMap((ticket) => {
    const newest = sessionsOf(index, `${ticket.map}/${ticket.id}`)[0];
    if (ticket.state !== "claimed" || newest === undefined || live.some((s) => holdsClaim(s, ticket))) return [];
    const was = newest.lastState === undefined || newest.lastState === "idle" ? null : PAUSED_WAS[newest.lastState];
    return [{ id: newest.sessionId, ticket: { map: ticket.map, id: ticket.id }, state: "paused" as const, was }];
  });
}

/** The forge the repo's tracker lives on; `null` for local markdown or a repo without a readable tracker doc. */
async function readForge(mainCheckout: string): Promise<Forge | null> {
  try {
    return forgeOf(await readTrackerKind(mainCheckout));
  } catch (error) {
    if (error instanceof DrylandError) return null;
    throw error;
  }
}

/**
 * On a forge, asks `gh`/`glab` whether the branches that are ahead have a PR or MR; a merged one makes the work
 * merged. The first failure (CLI missing, logged out, offline) leaves the rest unknown rather than guessed.
 */
async function withPullRequests(
  runner: ProcessRunner,
  mainCheckout: string,
  forge: Forge,
  states: TicketWorktreeState[],
): Promise<WorktreeGitState[]> {
  const result: WorktreeGitState[] = [];
  let reachable = true;
  for (const state of states) {
    if (!reachable || !state.aheadOfDefault) {
      result.push({ ...state, prExists: null });
      continue;
    }
    let found: PullRequest[] = [];
    try {
      for (const branch of state.branches) {
        const pr = await findPullRequest(runner, mainCheckout, forge, branch);
        if (pr !== null && pr.state !== "closed") found = [...found, pr];
      }
    } catch (error) {
      if (!(error instanceof DrylandError)) throw error;
      reachable = false;
      result.push({ ...state, prExists: null });
      continue;
    }
    result.push({
      ...state,
      merged: state.merged || (found.length > 0 && found.every((pr) => pr.state === "merged")),
      prExists: found.length > 0,
    });
  }
  return result;
}

async function readGitState(runner: ProcessRunner, mainCheckout: string, tickets: Ticket[]): Promise<GitState | null> {
  const states = await readTicketWorktreeStates(runner, mainCheckout, tickets);
  if (states === null) return null;
  const forge = await readForge(mainCheckout);
  // Local markdown has no forge to ask, so whether a PR exists is unknown, which the rules treat as "no PR".
  if (forge === null) return { worktrees: states.map((state) => ({ ...state, prExists: null })) };
  return { worktrees: await withPullRequests(runner, mainCheckout, forge, states) };
}
