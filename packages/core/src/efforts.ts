import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { exists } from "./env-fs.ts";
import { parseMap } from "./map.ts";
import type { EffortSnapshot } from "./next-step.ts";
import { isStoreInitialised, readStoreState, toMapModel } from "./state-store.ts";

/**
 * Every effort of `mainCheckout`, in name order, with its map parsed. The one pass that the tickets tree and the repo
 * snapshot share. A repo on the state store takes its maps from the store, and the specs from `.scratch/<effort>/`;
 * a markdown repo reads both from `.scratch/`.
 */
export async function readEfforts(mainCheckout: string): Promise<EffortSnapshot[]> {
  const scratch = join(mainCheckout, ".scratch");
  const dirs = (await readdir(scratch, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const stored = (await isStoreInitialised(mainCheckout)) ? (await readStoreState(mainCheckout)).maps : null;
  const names = [...new Set([...dirs, ...(stored?.map((m) => m.effort) ?? [])])].sort();
  const efforts: EffortSnapshot[] = [];
  for (const name of names) {
    const record = stored?.find((m) => m.effort === name);
    const mapText = stored === null ? await readFile(join(scratch, name, "map.md"), "utf8").catch(() => null) : null;
    efforts.push({
      name,
      map: record !== undefined ? toMapModel(record) : mapText === null ? null : parseMap(name, mapText),
      hasSpec: await exists(join(scratch, name, "spec.md")),
    });
  }
  return efforts;
}
