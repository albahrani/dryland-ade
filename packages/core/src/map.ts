import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { DrylandError } from "./errors.ts";
import { byTicketNumber, type Ticket } from "./ticket.ts";

export interface MapModel {
  /** The effort's slug. */
  name: string;
  title: string;
  destination: string;
  /** Not-yet-specified items: the map's fog. */
  fog: string[];
  /** One entry per resolved ticket: Decisions so far, derived from the tickets. */
  decisions: string[];
}

/** Rejects anything that is not usable as an effort slug, which is also the name of its directory under `.scratch/`. */
export function assertMapName(name: string): void {
  if (!/^[^/\\\s.][^/\\\s]*$/.test(name)) {
    throw new DrylandError(
      `"${name}" is not a map name.`,
      "Pass the name of a directory under .scratch/, e.g. --map shop.",
    );
  }
}

/** One map's tickets split the way its screens show them: ready to start, waiting on blockers, and held by a claim. */
export interface MapGroups {
  frontier: Ticket[];
  /** Open tickets with their unresolved blockers. */
  blocked: { ticket: Ticket; waitsFor: string[] }[];
  claimed: Ticket[];
}

/** Splits the tickets of one map, lowest number first, so the CLI and the map tab never disagree on a group. */
export function mapGroups(tickets: Ticket[]): MapGroups {
  const sorted = [...tickets].sort(byTicketNumber);
  const blocked = sorted
    .filter((t) => t.state === "open" && !isUnblocked(t, sorted))
    .map((ticket) => {
      const unresolved = unresolvedBlockers(ticket, sorted);
      return { ticket, waitsFor: unresolved === "unknown" ? [] : unresolved };
    });
  return {
    frontier: frontierOf(sorted),
    blocked,
    claimed: sorted.filter((t) => t.state === "claimed"),
  };
}

/**
 * The open, unblocked, unclaimed tickets of one map, lowest number first. A ticket is unblocked when every
 * ticket it lists is resolved; a blocker the map does not contain, or unknown blockers, keep it blocked.
 */
export function frontierOf(tickets: Ticket[]): Ticket[] {
  return tickets
    .filter((t) => t.state === "open" && t.claimant === null && isUnblocked(t, tickets))
    .sort(byTicketNumber);
}

/**
 * The blockers of `ticket` that are not resolved among `tickets`, or `"unknown"` when its backend cannot say.
 * A blocker `tickets` does not contain counts as unresolved.
 */
export function unresolvedBlockers(ticket: Ticket, tickets: Ticket[]): string[] | "unknown" {
  if (ticket.blockers === "unknown") return "unknown";
  const resolved = new Set(tickets.filter((t) => t.state === "resolved").map((t) => Number(t.id)));
  return ticket.blockers.filter((blocker) => !resolved.has(Number(blocker)));
}

/** Whether every blocker of `ticket` is known and resolved among `tickets`. */
export function isUnblocked(ticket: Ticket, tickets: Ticket[]): boolean {
  const unresolved = unresolvedBlockers(ticket, tickets);
  return unresolved !== "unknown" && unresolved.length === 0;
}

/** Efforts that have a `spec.md` but no tickets yet: the signal that `/to-tickets` is next. */
export async function findSpecsWithoutTickets(mainCheckout: string, tickets: Ticket[]): Promise<string[]> {
  const scratch = join(mainCheckout, ".scratch");
  const efforts = await readdir(scratch, { withFileTypes: true }).catch(() => []);
  const withTickets = new Set(tickets.map((t) => t.map));
  const found: string[] = [];
  for (const effort of efforts
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()) {
    if (withTickets.has(effort)) continue;
    const spec = await readFile(join(scratch, effort, "spec.md"), "utf8").catch(() => null);
    if (spec !== null) found.push(effort);
  }
  return found;
}
