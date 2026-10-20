import { join } from "node:path";
import {
  type Compatibility,
  type CompatConfig,
  NO_COMPAT_CONFIG,
  readCompatibility,
  skillSetupSnapshot,
} from "./compat.ts";
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
  /** Whether the app asks about the deviations, and what the Compatibility verdict says is degraded or broken. */
  compatibility: Compatibility;
}

/**
 * Reads tickets and efforts once and builds both the tickets tree and the repo snapshot from them. `sessions` are the
 * live Dryland sessions; without them no claim is called stale. A repo without the tracker doc has no tickets rather
 * than an error, so that it still gets its skill setup state and the `/setup-matt-pocock-skills` next step.
 * `compatConfig` is what the user decided about a modified setup: the deviations accepted and the rules re-enabled.
 */
export async function readProjectState(
  runner: ProcessRunner,
  mainCheckout: string,
  sessions: SessionSnapshot[] | null = null,
  compatConfig: CompatConfig = NO_COMPAT_CONFIG,
): Promise<ProjectState> {
  const tickets = (await exists(join(mainCheckout, TRACKER_DOC))) ? await readTickets(mainCheckout, runner) : [];
  const efforts = await readEfforts(mainCheckout);
  const skillSetup = await readSkillSetup(mainCheckout);
  const compatibility = await readCompatibility(mainCheckout, skillSetup, compatConfig);
  return {
    tree: buildTicketsTree(tickets, efforts),
    snapshot: await readRepoSnapshot(
      runner,
      mainCheckout,
      tickets,
      efforts,
      sessions,
      skillSetupSnapshot(skillSetup, compatibility, compatConfig),
    ),
    skillSetup,
    compatibility,
  };
}
