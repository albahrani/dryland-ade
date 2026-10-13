import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DrylandError } from "./errors.ts";
import { readClaim, rewriteClaim, ticketFile } from "./local-markdown.ts";
import type { ProcessRunner } from "./process-runner.ts";
import type { Ticket } from "./ticket.ts";
import { findTicket, parseTicketReference, readTickets } from "./tickets.ts";
import { writeTracker, type TrackerWriteOptions } from "./tracker-write.ts";

export interface ClaimOptions extends TrackerWriteOptions {
  /** Who is claiming: a session id or a branch name. */
  holder: string;
}

export interface TicketWriteResult {
  ticket: Ticket;
  warnings: string[];
}

/** The holder name for `cwd` when no session id is set: its branch, or the commit when detached. */
export async function branchHolder(runner: ProcessRunner, cwd: string): Promise<string> {
  const branch = (await runner.run("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd })).stdout.trim();
  if (branch !== "") return branch;
  const commit = (await runner.run("git", ["rev-parse", "--short", "HEAD"], { cwd })).stdout.trim();
  return commit === "" ? "unknown" : `detached-${commit}`;
}

/** Reads the ticket afresh, so a decision made under the lock never rests on an earlier read. */
async function currentTicket(mainCheckout: string, reference: string) {
  const ticket = findTicket(await readTickets(mainCheckout), reference);
  const path = await ticketFile(mainCheckout, ticket.map, ticket.id);
  if (path === null) {
    throw new DrylandError(
      `The file of ticket ${ticket.map}/${ticket.id} has gone.`,
      "Run `dryland ticket list` and try again.",
    );
  }
  return { ticket, path, text: await readFile(join(mainCheckout, path), "utf8") };
}

/** Claims an open ticket for `holder`. Of several concurrent claims exactly one wins. */
export async function claimTicket(
  runner: ProcessRunner,
  cwd: string,
  reference: string,
  options: ClaimOptions,
): Promise<TicketWriteResult> {
  parseTicketReference(reference);
  const { value, warnings } = await writeTracker(runner, cwd, options, async (mainCheckout) => {
    const { ticket, path, text } = await currentTicket(mainCheckout, reference);
    const name = `${ticket.map}/${ticket.id}`;
    if (ticket.state === "claimed") {
      const holder = ticket.claimant ?? "someone";
      const since = readClaim(text)?.at;
      throw new DrylandError(
        `Ticket ${name} is already claimed by ${holder}${since === undefined ? "" : ` since ${since}`}.`,
        `Pick another ticket with \`dryland map frontier ${ticket.map}\`, or ask ${holder} to release it.`,
      );
    }
    if (ticket.state === "resolved") {
      throw new DrylandError(
        `Ticket ${name} is already resolved.`,
        `Pick another ticket with \`dryland map frontier ${ticket.map}\`.`,
      );
    }
    const claim = { holder: options.holder, at: new Date().toISOString() };
    return {
      changes: [{ path, content: rewriteClaim(text, { claim }) }],
      message: `Claim ${name} for ${options.holder}`,
      value: { ...ticket, state: "claimed" as const, claimant: options.holder },
    };
  });
  return { ticket: value, warnings };
}

/** Releases a claimed ticket, restoring the status it had before the claim. */
export async function releaseTicket(
  runner: ProcessRunner,
  cwd: string,
  reference: string,
  options: TrackerWriteOptions = {},
): Promise<TicketWriteResult> {
  parseTicketReference(reference);
  const { value, warnings } = await writeTracker(runner, cwd, options, async (mainCheckout) => {
    const { ticket, path, text } = await currentTicket(mainCheckout, reference);
    const name = `${ticket.map}/${ticket.id}`;
    if (ticket.state !== "claimed") {
      throw new DrylandError(
        `Ticket ${name} is not claimed, so there is nothing to release.`,
        `Run \`dryland ticket show ${name}\` to see its state.`,
      );
    }
    return {
      changes: [{ path, content: rewriteClaim(text, { release: true }) }],
      message: `Release claim on ${name}`,
      value: { ...ticket, state: "open" as const, claimant: null },
    };
  });
  return { ticket: value, warnings };
}
