import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseMap } from "./map.ts";
import { readTickets } from "./tickets.ts";
import { type TreeTicket, toTreeTicket } from "./tickets-tree.ts";

/** A ticket as an editor tab shows it: its row fields plus the text of the file. */
export interface TicketDetail extends TreeTicket {
  /** The title of the parent map, or its name when the map has no `map.md`. */
  mapTitle: string;
  body: string;
  answer: string | null;
  comments: string[];
}

export interface MapDetail {
  name: string;
  title: string;
  /** The `map.md` text as written. */
  markdown: string;
}

/** The map's `map.md`, or `null` when it has none. */
export async function readMapDetail(mainCheckout: string, name: string): Promise<MapDetail | null> {
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
  return {
    ...toTreeTicket(ticket, own),
    mapTitle,
    body: ticket.body,
    answer: ticket.answer,
    comments: ticket.comments,
  };
}
