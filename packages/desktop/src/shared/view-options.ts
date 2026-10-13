import type { TicketsTree, TicketStatus, TreeTicket } from "@dryland/core";

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

const STATUS_ORDER: Record<TicketStatus, number> = { ready: 0, "in-progress": 1, blocked: 2, done: 3 };

const COMPARE: Record<TicketSort, (a: TreeTicket, b: TreeTicket) => number> = {
  number: (a, b) => Number(a.id) - Number(b.id),
  title: (a, b) => a.title.localeCompare(b.title),
  status: (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || Number(a.id) - Number(b.id),
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
