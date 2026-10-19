import { DrylandError } from "./errors.ts";
import { githubCheckout } from "./github-backend.ts";
import { claimGithubTicket, releaseGithubTicket } from "./github-write.ts";
import { readClaim, rewriteStatus } from "./local-markdown.ts";
import type { ProcessRunner } from "./process-runner.ts";
import { currentTicket, parseTicketReference, type TicketWriteResult } from "./tickets.ts";
import { writeTracker, type TrackerWriteOptions } from "./tracker-write.ts";

export interface ClaimOptions extends TrackerWriteOptions {
  /** Who is claiming: a branch name, so the claim outlives the session that made it (ADR 0010). */
  holder: string;
}

/** The holder name for `cwd`: its branch, or the commit when detached. */
export async function branchHolder(runner: ProcessRunner, cwd: string): Promise<string> {
  const branch = (await runner.run("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd })).stdout.trim();
  if (branch !== "") return branch;
  const commit = (await runner.run("git", ["rev-parse", "--short", "HEAD"], { cwd })).stdout.trim();
  return commit === "" ? "unknown" : `detached-${commit}`;
}

export interface ClaimResult extends TicketWriteResult {
  /** The holder held the claim already, so nothing was written. */
  alreadyHeld: boolean;
}

/**
 * Claims an open ticket for `holder`. Of several concurrent claims exactly one wins. Claiming a ticket its holder
 * already holds succeeds and changes nothing, so an agent in a ticket's worktree can claim the ticket Dryland claimed
 * for that worktree's branch at start.
 */
export async function claimTicket(
  runner: ProcessRunner,
  cwd: string,
  reference: string,
  options: ClaimOptions,
): Promise<ClaimResult> {
  const wanted = parseTicketReference(reference);
  // On GitHub the claim is the assignee, which is the user's `gh` login rather than the branch holder.
  const github = await githubCheckout(runner, cwd);
  if (github !== null) return claimGithubTicket(runner, github, reference);
  const { value, warnings } = await writeTracker(runner, cwd, options, async (mainCheckout) => {
    const { ticket, path, text } = await currentTicket(mainCheckout, wanted);
    const name = `${ticket.map}/${ticket.id}`;
    if (ticket.state === "claimed" && ticket.claimant === options.holder) {
      return { changes: [], message: "", value: { ticket, alreadyHeld: true } };
    }
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
      changes: [{ path, content: rewriteStatus(text, { claim }) }],
      message: `Claim ${name} for ${options.holder}`,
      value: { ticket: { ...ticket, state: "claimed" as const, claimant: options.holder }, alreadyHeld: false },
    };
  });
  return { ...value, warnings };
}

/** Releases a claimed ticket, restoring the status it had before the claim. */
export async function releaseTicket(
  runner: ProcessRunner,
  cwd: string,
  reference: string,
  options: TrackerWriteOptions = {},
): Promise<TicketWriteResult> {
  const wanted = parseTicketReference(reference);
  const github = await githubCheckout(runner, cwd);
  if (github !== null) return releaseGithubTicket(runner, github, reference);
  const { value, warnings } = await writeTracker(runner, cwd, options, async (mainCheckout) => {
    const { ticket, path, text } = await currentTicket(mainCheckout, wanted);
    const name = `${ticket.map}/${ticket.id}`;
    if (ticket.state !== "claimed") {
      throw new DrylandError(
        `Ticket ${name} is not claimed, so there is nothing to release.`,
        `Run \`dryland ticket show ${name}\` to see its state.`,
      );
    }
    return {
      changes: [{ path, content: rewriteStatus(text, { release: true }) }],
      message: `Release claim on ${name}`,
      value: { ...ticket, state: "open" as const, claimant: null },
      // A claim made by hand records no earlier status, so there is nothing to put back.
      warnings:
        readClaim(text) === null
          ? [
              `${name} was claimed without dryland, so it has no previous status to restore; its Status: line was removed and it is open.`,
            ]
          : [],
    };
  });
  return { ticket: value, warnings };
}
