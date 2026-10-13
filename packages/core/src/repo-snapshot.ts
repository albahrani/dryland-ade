import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { EffortSnapshot, RepoSnapshot } from "./next-step.ts";
import { parseMap } from "./map.ts";
import type { Ticket } from "./ticket.ts";
import { TRACKER_DOC } from "./tracker.ts";

const exists = (path: string) =>
  readFile(path).then(
    () => true,
    () => false,
  );

/** Reads the artifacts under `mainCheckout` into the snapshot the next-step rules take. */
export async function readRepoSnapshot(mainCheckout: string, tickets: Ticket[]): Promise<RepoSnapshot> {
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
    git: null,
    sessions: null,
    skillSetup: null,
  };
}
