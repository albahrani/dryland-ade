import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { DrylandError } from "./errors.ts";
import {
  findSection,
  type MarkdownSection,
  splitSections,
  stripAnnotations,
  stripHtmlComments,
} from "./local-markdown.ts";
import type { Ticket } from "./ticket.ts";

export interface MapModel {
  /** The effort's directory name under `.scratch/`. */
  name: string;
  title: string;
  destination: string;
  /** Not-yet-specified items: the map's fog. */
  fog: string[];
  /** One entry per line of the Decisions-so-far index. */
  decisions: string[];
  /** Every `## ` section as written, for anything the fields above do not cover. */
  sections: MarkdownSection[];
}

/** Bullet items of a section, with wrapped continuation lines joined. A leading "Nothing." means no items. */
function itemsOf(content: string | undefined): string[] {
  const text = stripHtmlComments(content ?? "").trim();
  if (/^(nothing|none)\b/i.test(text)) return [];
  const items: string[] = [];
  for (const line of text.split("\n")) {
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) items.push((bullet[1] ?? "").trim());
    else if (line.trim() !== "" && /^\s/.test(line) && items.length > 0) items[items.length - 1] += ` ${line.trim()}`;
  }
  return items;
}

export function parseMap(name: string, markdown: string): MapModel {
  const lines = stripAnnotations(markdown).split("\n");
  const { preamble, sections } = splitSections(lines);
  const section = (heading: string) => findSection(sections, heading);
  const titleLine = preamble.find((line) => line.startsWith("# "))?.slice(2).trim() ?? "";
  return {
    name,
    title: titleLine.replace(/^Map:\s*/i, ""),
    destination: stripHtmlComments(section("destination") ?? "").trim(),
    fog: itemsOf(section("not yet specified")),
    decisions: itemsOf(section("decisions so far")),
    sections,
  };
}

/** Rejects anything that is not the name of a directory directly under `.scratch/`. */
export function assertMapName(name: string): void {
  if (!/^[^/\\\s.][^/\\\s]*$/.test(name)) {
    throw new DrylandError(
      `"${name}" is not a map name.`,
      "Pass the name of a directory under .scratch/, e.g. --map shop.",
    );
  }
}

export async function readMapFile(mainCheckout: string, name: string): Promise<MapModel> {
  const markdown = await readFile(join(mainCheckout, ".scratch", name, "map.md"), "utf8").catch(() => null);
  if (markdown === null) {
    throw new DrylandError(
      `There is no map "${name}": .scratch/${name}/map.md does not exist.`,
      "Run `dryland ticket list` to see the maps that have tickets, or start one with /wayfinder.",
    );
  }
  return parseMap(name, markdown);
}

/**
 * The open, unblocked, unclaimed tickets of one map, lowest number first. A ticket is unblocked when every
 * ticket it lists is resolved; a blocker the map does not contain, or unknown blockers, keep it blocked.
 */
export function frontierOf(tickets: Ticket[]): Ticket[] {
  const resolved = new Set(tickets.filter((t) => t.state === "resolved").map((t) => Number(t.id)));
  return tickets
    .filter(
      (t) =>
        t.state === "open" &&
        t.claimant === null &&
        t.blockers !== "unknown" &&
        t.blockers.every((blocker) => resolved.has(Number(blocker))),
    )
    .sort((a, b) => Number(a.id) - Number(b.id));
}

/** Efforts that have a `spec.md` but no tickets yet: the signal that `/to-tickets` is next. */
export async function findSpecsWithoutTickets(mainCheckout: string, tickets: Ticket[]): Promise<string[]> {
  const scratch = join(mainCheckout, ".scratch");
  const efforts = await readdir(scratch, { withFileTypes: true }).catch(() => []);
  const withTickets = new Set(tickets.map((t) => t.map));
  const found: string[] = [];
  for (const effort of efforts.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()) {
    if (withTickets.has(effort)) continue;
    const spec = await readFile(join(scratch, effort, "spec.md"), "utf8").catch(() => null);
    if (spec !== null) found.push(effort);
  }
  return found;
}
