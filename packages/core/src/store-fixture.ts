import { createStoreMap, createStoreTicket, initStore } from "./state-store.ts";

/** One effort of a fixture store: an optional map and its tickets, created in order (so `blockedBy` can name earlier ones). */
export interface FixtureEffort {
  effort: string;
  map?: { title: string; destination?: string; notes?: string; fog?: string[]; outOfScope?: string[] };
  tickets?: {
    title: string;
    type?: string;
    report?: string;
    criteria?: { text: string; done?: boolean }[];
    spec?: string;
    /** Ticket numbers of the same effort, e.g. `[1]`. */
    blockedBy?: number[];
    triageRole?: string;
    hitl?: boolean;
  }[];
}

/**
 * Initialises the store of the git repo at `repoPath` and fills it with `efforts`, through the same write path the
 * CLI uses. The one helper that core, CLI and e2e tests build their throwaway store repos with.
 */
export async function seedStore(repoPath: string, efforts: FixtureEffort[] = []): Promise<void> {
  await initStore(repoPath);
  for (const { effort, map, tickets = [] } of efforts) {
    if (map !== undefined) await createStoreMap(repoPath, JSON.stringify({ effort, ...map }), { author: "engine" });
    for (const t of tickets) {
      const document = {
        ...t,
        effort,
        type: t.type ?? "task",
        criteria: t.criteria?.map((c) => ({ text: c.text, done: c.done ?? false })),
        blockedBy: t.blockedBy?.map((n) => `${effort}/${String(n).padStart(2, "0")}`),
      };
      await createStoreTicket(repoPath, JSON.stringify(document), { author: "engine" });
    }
  }
}
