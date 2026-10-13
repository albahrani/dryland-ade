import type { TicketsTreeMap, TicketStatus } from "@dryland/core";
import { STATUS_META } from "./status-meta.ts";

/** What a map's stacked bar divides into: ticket statuses, and the fog items that are not tickets yet. */
export type ProgressSegment = TicketStatus | "fog";

/** Bar order: finished work first, fog last. */
export const PROGRESS_ORDER: ProgressSegment[] = ["done", "in-progress", "ready", "blocked", "fog"];

/** Label and colour of each bar segment: the ticket statuses, plus fog, which is not a ticket status. */
export const SEGMENT_META: Record<ProgressSegment, { label: string; colour: string }> = {
  ...STATUS_META,
  fog: { label: "Fog", colour: "var(--fg-dim)" },
};

export interface MapProgress {
  counts: Record<ProgressSegment, number>;
  total: number;
}

/** Counts a map's tickets by status plus its fog. Reads the whole map, whatever the view's filters hide. */
export function mapProgress(map: TicketsTreeMap): MapProgress {
  const counts: Record<ProgressSegment, number> = {
    done: 0,
    "in-progress": 0,
    ready: 0,
    blocked: 0,
    fog: map.fog.length,
  };
  for (const ticket of [...map.planning, ...map.implementation, ...map.done]) counts[ticket.status]++;
  const total = PROGRESS_ORDER.reduce((sum, segment) => sum + counts[segment], 0);
  return { counts, total };
}
