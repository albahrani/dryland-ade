import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { exists } from "./env-fs.ts";
import { parseMap } from "./map.ts";
import type { EffortSnapshot } from "./next-step.ts";

/**
 * Every effort directory under `.scratch/` of `mainCheckout`, in name order, with its map parsed. The one pass over
 * `.scratch/` that the tickets tree and the repo snapshot share.
 */
export async function readEfforts(mainCheckout: string): Promise<EffortSnapshot[]> {
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
  return efforts;
}
