import { readEfforts } from "./efforts.ts";
import type { RepoSnapshot, SessionSnapshot } from "./next-step.ts";
import type { ProcessRunner } from "./process-runner.ts";
import { readRepoSnapshot } from "./repo-snapshot.ts";
import { readTickets } from "./tickets.ts";
import { buildTicketsTree, type TicketsTree } from "./tickets-tree.ts";

/** What the app shows of a project: the Tickets view's tree, and the snapshot its next steps come from. */
export interface ProjectState {
  tree: TicketsTree;
  snapshot: RepoSnapshot;
}

/**
 * Reads tickets and efforts once and builds both the tickets tree and the repo snapshot from them. `sessions` are the
 * live Dryland sessions; without them no claim is called stale.
 */
export async function readProjectState(
  runner: ProcessRunner,
  mainCheckout: string,
  sessions: SessionSnapshot[] | null = null,
): Promise<ProjectState> {
  const tickets = await readTickets(mainCheckout);
  const efforts = await readEfforts(mainCheckout);
  return {
    tree: buildTicketsTree(tickets, efforts),
    snapshot: await readRepoSnapshot(runner, mainCheckout, tickets, efforts, sessions),
  };
}
