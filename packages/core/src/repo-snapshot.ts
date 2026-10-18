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
} from "./next-step.ts";
import type { ProcessRunner } from "./process-runner.ts";
import { readSessionIndex, sessionsOf } from "./session-index.ts";
import type { Ticket } from "./ticket.ts";
import { TRACKER_DOC } from "./tracker.ts";
import { readTicketWorktreeStates } from "./worktree.ts";

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

async function readGitState(runner: ProcessRunner, mainCheckout: string, tickets: Ticket[]): Promise<GitState | null> {
  const states = await readTicketWorktreeStates(runner, mainCheckout, tickets);
  if (states === null) return null;
  // No forge backend is read yet, so whether a PR exists is unknown, which the rules treat as "no PR".
  return { worktrees: states.map((state) => ({ ...state, prExists: null })) };
}
