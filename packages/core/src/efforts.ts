import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { exists } from "./env-fs.ts";
import type { EffortSnapshot } from "./next-step.ts";
import { isStoreInitialised, readStoreState, toMapModel } from "./state-store.ts";

/**
 * Every effort of `mainCheckout`, in name order: the maps come from the state store and the specs from
 * `.scratch/<effort>/spec.md`, the only thing read from `.scratch`. A repo without a store has efforts for its spec
 * directories alone, each without a map.
 */
export async function readEfforts(mainCheckout: string): Promise<EffortSnapshot[]> {
  const scratch = join(mainCheckout, ".scratch");
  const dirs = (await readdir(scratch, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const state = (await isStoreInitialised(mainCheckout)) ? await readStoreState(mainCheckout) : null;
  const names = [...new Set([...dirs, ...(state?.maps.map((m) => m.effort) ?? [])])].sort();
  const efforts: EffortSnapshot[] = [];
  for (const name of names) {
    const record = state?.maps.find((m) => m.effort === name);
    efforts.push({
      name,
      map: record !== undefined && state !== null ? toMapModel(record, state.tickets) : null,
      hasSpec: await exists(join(scratch, name, "spec.md")),
    });
  }
  return efforts;
}
