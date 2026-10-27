import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { mapGroups, parseMap } from "./map.ts";
import {
  decisionsOf,
  isStoreInitialised,
  readStoreState,
  type StoreMap,
  type StoreState,
  type StoreTicket,
  toTicket,
} from "./state-store.ts";
import type { Ticket, TriageRole } from "./ticket.ts";
import { readTickets } from "./tickets.ts";
import { type TreeTicket, toTreeTicket } from "./tickets-tree.ts";

/** A ticket as an editor tab shows it: its row fields plus the text of the file. */
export interface TicketDetail extends TreeTicket {
  /** The title of the parent map, or its name when the map has no `map.md`. */
  mapTitle: string;
  /** The ticket text; for a store ticket its Report and a checklist of its acceptance criteria. */
  body: string;
  answer: string | null;
  comments: string[];
  /** The ticket's triage role; `null` when it carries none. */
  triageRole: TriageRole | null;
}

export interface MapDetail {
  name: string;
  title: string;
  /** The `map.md` text as written; for a store map the record rendered as markdown. */
  markdown: string;
}

const list = (items: string[]) => items.map((item) => `- ${item}`).join("\n");

/**
 * A store map record as the markdown its tab shows: the record's own fields, then the frontier, the blocked and the
 * claimed tickets and Decisions so far, which are read from the effort's tickets and not stored on the map.
 */
function renderMap(map: StoreMap, state: StoreState): string {
  const section = (heading: string, items: string[]) => (items.length === 0 ? [] : [`## ${heading}`, list(items)]);
  const { frontier, blocked, claimed } = mapGroups(state.tickets.filter((t) => t.effort === map.effort).map(toTicket));
  const row = (t: Ticket) => `${t.id} ${t.title}`;
  return [
    `# Map: ${map.title}`,
    "## Destination",
    map.destination,
    ...(map.notes === "" ? [] : ["## Notes", map.notes]),
    ...section("Frontier", frontier.map(row)),
    ...section(
      "Blocked",
      blocked.map(({ ticket, waitsFor }) => `${row(ticket)} (waits for ${waitsFor.join(", ")})`),
    ),
    ...section(
      "Claimed",
      claimed.map((t) => `${row(t)} (${t.claimant ?? "unknown"})`),
    ),
    ...section("Decisions so far", decisionsOf(state.tickets, map.effort)),
    ...section("Not yet specified", map.fog),
    ...section("Out of scope", map.outOfScope),
  ].join("\n\n");
}

/** A store ticket's Report with its acceptance criteria as a checklist. */
function renderTicketBody(ticket: StoreTicket): string {
  if (ticket.criteria.length === 0) return ticket.report;
  const boxes = ticket.criteria.map((c) => `- [${c.done ? "x" : " "}] ${c.text}`).join("\n");
  return `${ticket.report}\n\n## Acceptance criteria\n\n${boxes}`;
}

/** The map of an effort, or `null` when it has none: a `map.md` for markdown, a map record for the store. */
export async function readMapDetail(mainCheckout: string, name: string): Promise<MapDetail | null> {
  if (await isStoreInitialised(mainCheckout)) {
    const state = await readStoreState(mainCheckout);
    const map = state.maps.find((m) => m.effort === name);
    return map === undefined ? null : { name, title: map.title || name, markdown: renderMap(map, state) };
  }
  const markdown = await readFile(join(mainCheckout, ".scratch", name, "map.md"), "utf8").catch(() => null);
  if (markdown === null) return null;
  return { name, title: parseMap(name, markdown).title || name, markdown };
}

/** One ticket by map and number, or `null` when it does not exist. */
export async function readTicketDetail(mainCheckout: string, map: string, id: string): Promise<TicketDetail | null> {
  const own = (await readTickets(mainCheckout)).filter((t) => t.map === map);
  const ticket = own.find((t) => t.id === id);
  if (ticket === undefined) return null;
  const mapTitle = (await readMapDetail(mainCheckout, map))?.title ?? map;
  const stored = (await isStoreInitialised(mainCheckout))
    ? (await readStoreState(mainCheckout)).tickets.find((t) => t.effort === map && t.id === id)
    : undefined;
  return {
    ...toTreeTicket(ticket, own),
    mapTitle,
    body: stored === undefined ? ticket.body : renderTicketBody(stored),
    answer: ticket.answer,
    comments: ticket.comments,
    triageRole: ticket.triageRole,
  };
}
