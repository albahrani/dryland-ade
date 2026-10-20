import type { Tracker } from "./tracker-cli.ts";
import { DrylandError } from "./errors.ts";
import { TRIAGE_ROLES, type Ticket, type TicketType, type TriageRole } from "./ticket.ts";
import { findTicket, parseTicketReference, readTickets } from "./tickets.ts";
import type { ProcessRunner } from "./process-runner.ts";

// What every tracker backend checks before it writes, so the rules and their messages are the same everywhere.

/** What a remote backend needs to create a ticket. */
export interface TrackerCreateInput {
  map: string;
  title: string;
  type: TicketType;
  question?: string | undefined;
  blockedBy?: string[] | undefined;
}


export const nameOf = (ticket: Ticket) => `${ticket.map}/${ticket.id}`;

export async function ticketNamed(runner: ProcessRunner, mainCheckout: string, reference: string): Promise<Ticket> {
  return findTicket(await readTickets(mainCheckout, runner), parseTicketReference(reference));
}

/** Runs the steps after an issue was created; a failure says which issue exists, so nothing is claimed as whole. */
export async function afterCreate<T>(
  tracker: Tracker,
  number: number,
  step: string,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof DrylandError)) throw error;
    throw new DrylandError(
      `Issue #${number} was created, but ${step} failed: ${error.message}`,
      `Finish by hand on ${tracker}, or close #${number} and retry. ${error.nextAction}`,
    );
  }
}

/** Decides a claim from the issue's state and first assignee: `held` when the user has it already, else `free`. */
export function decideClaim(ticket: Ticket, closed: boolean, holder: string | undefined, login: string): "free" | "held" {
  if (closed) {
    throw new DrylandError(
      `Ticket ${nameOf(ticket)} is already resolved.`,
      `Pick another ticket with \`dryland map frontier ${ticket.map}\`.`,
    );
  }
  if (holder === login) return "held";
  if (holder !== undefined) {
    throw new DrylandError(
      `Ticket ${nameOf(ticket)} is already claimed by ${holder}.`,
      `Pick another ticket with \`dryland map frontier ${ticket.map}\`, or ask ${holder} to release it.`,
    );
  }
  return "free";
}

/** Only a claimed ticket is released; checked before the login is looked up. */
export function assertClaimed(ticket: Ticket): void {
  if (ticket.state === "claimed") return;
  throw new DrylandError(
    `Ticket ${nameOf(ticket)} is not claimed, so there is nothing to release.`,
    `Run \`dryland ticket show ${nameOf(ticket)}\` to see its state.`,
  );
}

/** Only the user's own claim is released. */
export function assertClaimedBy(ticket: Ticket, login: string, tracker: Tracker): void {
  if (ticket.claimant !== login) {
    throw new DrylandError(
      `Ticket ${nameOf(ticket)} is claimed by ${ticket.claimant}, not by you (${login}), so it is not released.`,
      `Ask ${ticket.claimant} to release it, or unassign them on ${tracker} if the claim is stale.`,
    );
  }
}

/** A closed issue cannot be resolved again. */
export function assertCanResolve(ticket: Ticket, closed: boolean): void {
  if (!closed) return;
  throw new DrylandError(
    `Ticket ${nameOf(ticket)} is already resolved.`,
    `Add a comment instead, or pick another ticket with \`dryland map frontier ${ticket.map}\`.`,
  );
}

/** The issue body with `answer` under its `## Answer` heading, filling an empty heading a template left rather than adding a second. */
export function withAnswer(issueBody: string | null | undefined, answer: string): string {
  const body = (issueBody ?? "").replace(/\r\n/g, "\n").replace(/\s+$/, "");
  const stub = /^## Answer[ \t]*\n*(?=## |$)/m;
  const filled = stub.test(body)
    ? body.replace(stub, `## Answer\n\n${answer}\n\n`).replace(/\s+$/, "")
    : `${body}\n\n## Answer\n\n${answer}`.replace(/^\n+/, "");
  return `${filled}\n`;
}

/** A role may be given as the canonical role or as the repo's own label for it; anything else fails with the valid ones. */
export function resolveTriageRole(labels: ReadonlyMap<TriageRole, string>, role: string): TriageRole {
  const given = role.trim().toLowerCase();
  const resolved =
    TRIAGE_ROLES.find((known) => known === given) ??
    TRIAGE_ROLES.find((known) => labels.get(known)?.toLowerCase() === given);
  if (resolved !== undefined) return resolved;
  const valid = TRIAGE_ROLES.map((known) => {
    const label = labels.get(known) ?? known;
    return label === known ? known : `${known} (${label})`;
  });
  throw new DrylandError(`"${role}" is not a triage role.`, `Use --role with one of: ${valid.join(", ")}.`);
}

/** Only an open ticket can be re-triaged. */
export function assertCanTriage(ticket: Ticket): void {
  if (ticket.state === "open") return;
  const name = nameOf(ticket);
  throw new DrylandError(
    `Ticket ${name} is ${ticket.state}, so it cannot be re-triaged.`,
    ticket.state === "claimed"
      ? `Release it first with \`dryland ticket release ${name}\`.`
      : "Create a new ticket for the follow-up work.",
  );
}

/**
 * Checks a change of blockers against the ticket's current ones and the numbers of its map.
 * Every number to add must exist, differ from the ticket and not block it already; every one to remove must block it.
 */
export function assertBlockChange(
  ticket: Ticket,
  currentBlockers: number[],
  mapNumbers: ReadonlySet<number>,
  add: number[],
  remove: number[],
): void {
  const name = `${ticket.map}/${ticket.id}`;
  for (const number of add) {
    if (!mapNumbers.has(number)) {
      throw new DrylandError(
        `Ticket ${ticket.map}/${number} does not exist, so it cannot block ${name}.`,
        `Run \`dryland ticket list\` and pass existing numbers of ${ticket.map} to --add.`,
      );
    }
    if (number === Number(ticket.id)) {
      throw new DrylandError(`Ticket ${name} cannot block itself.`, "Pass a different ticket number to --add.");
    }
    if (currentBlockers.includes(number)) {
      throw new DrylandError(
        `Ticket ${name} is already blocked by ${ticket.map}/${number}.`,
        `Run \`dryland ticket show ${name}\` to see its blockers.`,
      );
    }
  }
  for (const number of remove) {
    if (!currentBlockers.includes(number)) {
      throw new DrylandError(
        `Ticket ${name} is not blocked by ${ticket.map}/${number}, so there is nothing to remove.`,
        `Run \`dryland ticket show ${name}\` to see its blockers.`,
      );
    }
  }
}
