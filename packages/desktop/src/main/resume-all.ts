import type { TicketRef } from "@dryland/core";
import { DrylandError } from "@dryland/core";
import type { SessionInfo } from "../shared/api.ts";
import { ticketKey } from "../shared/tabs.ts";

/** What resuming a set of paused sessions together did: those now running, hidden, and what went wrong. */
export interface ResumedAll {
  sessions: SessionInfo[];
  warnings: string[];
}

/**
 * Resumes each ticket's paused session in turn, one after another so the CLIs do not all start at once. A ticket
 * that cannot be resumed is reported and the rest go on. Opens no tab: the caller only learns of the sessions.
 */
export async function resumeAll(
  tickets: readonly TicketRef[],
  resume: (ticket: TicketRef) => Promise<{ session: SessionInfo; warnings: string[] }>,
): Promise<ResumedAll> {
  const result: ResumedAll = { sessions: [], warnings: [] };
  for (const ticket of tickets) {
    try {
      const { session, warnings } = await resume(ticket);
      result.sessions.push(session);
      result.warnings.push(...warnings.map((warning) => `${ticketKey(ticket)}: ${warning}`));
    } catch (error) {
      if (!(error instanceof DrylandError)) throw error;
      result.warnings.push(`${ticketKey(ticket)}: ${error.message} ${error.nextAction}`);
    }
  }
  return result;
}
