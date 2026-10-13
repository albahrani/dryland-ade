import type { TicketsTree, TicketStatus, TreeTicket } from "@dryland/core";
import { STATUS_META } from "./status-meta.ts";

export type TicketSort = "number" | "title" | "status";

/** What the Tickets view's "..." menu controls, apart from expand/collapse, which is view-local. */
export interface ViewOptions {
  sort: TicketSort;
  /** Open ticket statuses that stay visible. */
  statuses: TicketStatus[];
  showDone: boolean;
  showFog: boolean;
}

export const OPEN_STATUSES: TicketStatus[] = ["ready", "in-progress", "blocked"];

export const DEFAULT_VIEW_OPTIONS: ViewOptions = {
  sort: "number",
  statuses: OPEN_STATUSES,
  showDone: true,
  showFog: true,
};

const COMPARE: Record<TicketSort, (a: TreeTicket, b: TreeTicket) => number> = {
  number: (a, b) => Number(a.id) - Number(b.id),
  title: (a, b) => a.title.localeCompare(b.title),
  status: (a, b) => STATUS_META[a.status].order - STATUS_META[b.status].order || Number(a.id) - Number(b.id),
};

/** The tree as the user's view options show it. Returns a new tree and leaves `tree` untouched. */
export function applyViewOptions(tree: TicketsTree, options: ViewOptions): TicketsTree {
  const open = (tickets: TreeTicket[]) =>
    tickets.filter((t) => options.statuses.includes(t.status)).sort(COMPARE[options.sort]);
  return {
    maps: tree.maps.map((map) => ({
      ...map,
      fog: options.showFog ? map.fog : [],
      planning: open(map.planning),
      implementation: open(map.implementation),
      done: options.showDone ? map.done : [],
    })),
  };
}
