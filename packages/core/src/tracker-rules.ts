import { DrylandError } from "./errors.ts";
import { TRIAGE_ROLES, type Ticket, type TriageRole } from "./ticket.ts";

/** What every tracker backend checks before it writes, so the rules and their messages are the same everywhere. */

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
  const name = `${ticket.map}/${ticket.id}`;
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
