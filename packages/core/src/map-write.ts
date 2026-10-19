import { DrylandError, requireOneLine } from "./errors.ts";
import { appendDecision } from "./local-markdown.ts";
import { assertMapName, type MapModel, parseMap, readMapText } from "./map.ts";
import type { ProcessRunner } from "./process-runner.ts";
import { remoteBackend } from "./tracker-backend.ts";
import { writeTracker, type TrackerWriteOptions, type TrackerWriteResult } from "./tracker-write.ts";

export interface MapIndexEntry {
  /** What the entry links as, e.g. the ticket's title. */
  title: string;
  /** Where the link points, relative to the map file, e.g. `issues/01-cart.md`. */
  link: string;
  /** The decision in one line. */
  gist: string;
}

/** Appends one context pointer (title, link and gist) to a map's Decisions-so-far. No other line of the map changes. */
export async function indexMap(
  runner: ProcessRunner,
  cwd: string,
  name: string,
  entry: MapIndexEntry,
  options: TrackerWriteOptions = {},
): Promise<TrackerWriteResult<MapModel>> {
  assertMapName(name);
  const title = requireOneLine("map index title", entry.title, "title");
  const gist = requireOneLine("map index gist", entry.gist, "gist");
  const link = requireOneLine("map index link", entry.link, "link");
  if (/[\[\]]/.test(title)) {
    throw new DrylandError(
      `The title "${title}" contains square brackets, which would break the link.`,
      "Pass a title without [ or ].",
    );
  }
  if (/[\s()]/.test(link)) {
    throw new DrylandError(
      `"${link}" is not a usable link.`,
      "Pass a path without spaces or parentheses, e.g. issues/01-cart.md.",
    );
  }
  const remote = await remoteBackend(runner, cwd);
  if (remote !== null) return remote.backend.indexMap(runner, remote.checkout, name, { title, link, gist });
  return writeTracker(runner, cwd, options, async (mainCheckout) => {
    const markdown = await readMapText(mainCheckout, name); // fails with the next action when the map is unknown
    const path = `.scratch/${name}/map.md`;
    const content = appendDecision(markdown, `- [${title}](${link}): ${gist}`);
    return {
      changes: [{ path, content }],
      message: `Index "${title}" in the ${name} map`,
      value: parseMap(name, content),
    };
  });
}
