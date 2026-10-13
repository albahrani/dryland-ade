import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { exists } from "./env-fs.ts";
import type { EffortSnapshot, GitState, RepoSnapshot } from "./next-step.ts";
import { parseMap } from "./map.ts";
import type { ProcessRunner } from "./process-runner.ts";
import type { Ticket } from "./ticket.ts";
import { TRACKER_DOC } from "./tracker.ts";
import { readTicketWorktreeStates } from "./worktree.ts";

/** Reads the artifacts under `mainCheckout` into the snapshot the next-step rules take. */
export async function readRepoSnapshot(
  runner: ProcessRunner,
  mainCheckout: string,
  tickets: Ticket[],
): Promise<RepoSnapshot> {
  const scratch = join(mainCheckout, ".scratch");
  const entries = await readdir(scratch, { withFileTypes: true }).catch(() => []);
  const efforts: EffortSnapshot[] = [];
  for (const name of entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()) {
    const mapText = await readFile(join(scratch, name, "map.md"), "utf8").catch(() => null);
    efforts.push({
      name,
      map: mapText === null ? null : parseMap(name, mapText),
      hasSpec: await exists(join(scratch, name, "spec.md")),
    });
  }
  const adrs = await readdir(join(mainCheckout, "docs", "adr")).catch(() => []);
  return {
    setupConfigPresent: await exists(join(mainCheckout, TRACKER_DOC)),
    efforts,
    tickets,
    hasGlossary: await exists(join(mainCheckout, "GLOSSARY.md")),
    adrCount: adrs.filter((file) => file.endsWith(".md")).length,
    git: await readGitState(runner, mainCheckout, tickets),
    // Not fed yet: live sessions are ticket 65 and skill setup with the Compatibility verdict is ticket 66.
    // `null` means unknown, so no claim is called stale and no rule is disabled meanwhile.
    sessions: null,
    skillSetup: null,
  };
}

async function readGitState(runner: ProcessRunner, mainCheckout: string, tickets: Ticket[]): Promise<GitState | null> {
  const states = await readTicketWorktreeStates(runner, mainCheckout, tickets);
  if (states === null) return null;
  // No forge backend is read yet, so whether a PR exists is unknown, which the rules treat as "no PR".
  return { worktrees: states.map((state) => ({ ...state, prExists: null })) };
}
