import { join } from "node:path";
import { readEfforts } from "./efforts.ts";
import { exists } from "./env-fs.ts";
import type { RepoSnapshot, SessionSnapshot } from "./next-step.ts";
import type { ProcessRunner } from "./process-runner.ts";
import { readRepoSnapshot } from "./repo-snapshot.ts";
import { readSkillSetup, type SkillSetupReport } from "./skill-setup.ts";
import { readTickets } from "./tickets.ts";
import { TRACKER_DOC } from "./tracker.ts";
import { buildTicketsTree, type TicketsTree } from "./tickets-tree.ts";

/** What the app shows of a project: the Tickets view's tree, and the snapshot its next steps come from. */
export interface ProjectState {
  tree: TicketsTree;
  snapshot: RepoSnapshot;
  /** How the installed skills and `docs/agents` files compare to the default setup. */
  skillSetup: SkillSetupReport;
}

/**
 * Reads tickets and efforts once and builds both the tickets tree and the repo snapshot from them. `sessions` are the
 * live Dryland sessions; without them no claim is called stale. A repo without the tracker doc has no tickets rather
 * than an error, so that it still gets its skill setup state and the `/setup-matt-pocock-skills` next step.
 */
export async function readProjectState(
  runner: ProcessRunner,
  mainCheckout: string,
  sessions: SessionSnapshot[] | null = null,
): Promise<ProjectState> {
  const tickets = (await exists(join(mainCheckout, TRACKER_DOC))) ? await readTickets(mainCheckout, runner) : [];
  const efforts = await readEfforts(mainCheckout);
  return {
    tree: buildTicketsTree(tickets, efforts),
    snapshot: await readRepoSnapshot(runner, mainCheckout, tickets, efforts, sessions),
    skillSetup: await readSkillSetup(mainCheckout),
  };
}
