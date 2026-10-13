import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DrylandError } from "./errors.ts";
import { appendDecision } from "./local-markdown.ts";
import { assertMapName, type MapModel, parseMap, readMapFile } from "./map.ts";
import type { ProcessRunner } from "./process-runner.ts";
import { writeTracker, type TrackerWriteOptions, type TrackerWriteResult } from "./tracker-write.ts";

export interface MapIndexEntry {
  /** What the entry links as, e.g. the ticket's title. */
  title: string;
  /** Where the link points, relative to the map file, e.g. `issues/01-cart.md`. */
  link: string;
  /** The decision in one line. */
  gist: string;
}

function oneLine(name: string, value: string, flag: string): string {
  const text = value.trim();
  if (text === "" || /[\r\n]/.test(text)) {
    throw new DrylandError(`The ${name} of a map index entry must be one non-empty line.`, `Pass it as --${flag} "<text>".`);
  }
  return text;
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
  const title = oneLine("title", entry.title, "title");
  const gist = oneLine("gist", entry.gist, "gist");
  const link = oneLine("link", entry.link, "link");
  if (/[\s()]/.test(link)) {
    throw new DrylandError(`"${link}" is not a usable link.`, "Pass a path without spaces or parentheses, e.g. issues/01-cart.md.");
  }
  return writeTracker(runner, cwd, options, async (mainCheckout) => {
    await readMapFile(mainCheckout, name); // fails with the next action when the map is unknown
    const path = `.scratch/${name}/map.md`;
    const markdown = await readFile(join(mainCheckout, path), "utf8");
    const content = appendDecision(markdown, `- [${title}](${link}): ${gist}`);
    return {
      changes: [{ path, content }],
      message: `Index "${title}" in the ${name} map`,
      value: parseMap(name, content),
    };
  });
}
