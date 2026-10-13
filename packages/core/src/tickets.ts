import { DrylandError } from "./errors.ts";
import { readLocalMarkdownTickets } from "./local-markdown.ts";
import { findMainCheckout } from "./main-checkout.ts";
import type { ProcessRunner } from "./process-runner.ts";
import type { Ticket } from "./ticket.ts";
import { readTrackerKind } from "./tracker.ts";

/** Lists the tickets of the repo containing `cwd`, from the tracker its docs name. */
export async function listTickets(runner: ProcessRunner, cwd: string): Promise<Ticket[]> {
  const mainCheckout = await findMainCheckout(runner, cwd);
  if (mainCheckout === null) {
    throw new DrylandError(
      `${cwd} is not inside a git repository.`,
      "Run dryland from inside the repo, or from one of its worktrees.",
    );
  }
  const kind = await readTrackerKind(mainCheckout);
  if (kind !== "local-markdown") {
    throw new DrylandError(
      `The ${kind} tracker is not supported by this version of dryland yet.`,
      "Use a local-markdown tracker for now (/setup-matt-pocock-skills).",
    );
  }
  return readLocalMarkdownTickets(mainCheckout);
}
