import type { TicketRef } from "@dryland/core";
import { isRecord, isTicketRef, MAP_NAME } from "./tracker-actions.ts";
import { ticketKey } from "./tabs.ts";

/** What a session starts on: a ticket, a map to continue, or a map the `/wayfinder` skill has yet to chart. */
export type WorkTarget = { kind: "ticket"; ticket: TicketRef } | { kind: "map"; map: string } | { kind: "new-map" };

/** The effort a new map's temporary worktree is named after, as `new-map/scratch-wayfinder`, until the skill names it. */
export const NEW_MAP_EFFORT = "new-map";

/** The scratch worktree slug of a map's own sessions and of a new map's: `<map>/scratch-wayfinder`. */
export const MAP_WORKTREE_SLUG = "wayfinder";

/** Same rule as core's `SKILL_NAME`, kept here because this module runs in the renderer too. */
const SKILL = /^\w[\w.-]*$/;

/** Whether `value`, which came from the renderer, is a well-formed work target. */
export function isWorkTarget(value: unknown): value is WorkTarget {
  if (!isRecord(value)) return false;
  switch (value.kind) {
    case "ticket":
      return isTicketRef(value.ticket);
    case "map":
      return typeof value.map === "string" && MAP_NAME.test(value.map);
    case "new-map":
      return true;
    default:
      return false;
  }
}

/** Whether `value`, which came from the renderer, names a skill or asks for the recommended command (`null`). */
export const isSkillChoice = (value: unknown): value is string | null =>
  value === null || (typeof value === "string" && SKILL.test(value));

/**
 * The rule-engine-style command to pre-type when the user picked `skill` instead of the recommended one: the skill
 * naming what it works on, which the user can edit before submitting. A new map has nothing to name yet.
 */
export function chosenSkillCommand(skill: string, target: WorkTarget): string {
  switch (target.kind) {
    case "ticket":
      return `/${skill} ${ticketKey(target.ticket)}`;
    case "map":
      return `/${skill} ${target.map}`;
    case "new-map":
      return `/${skill} `;
  }
}

/** How a session's tab is named: its agent and what it works on. */
export function sessionTitle(session: {
  agent: { name: string };
  ticket: TicketRef | null;
  map: string | null;
}): string {
  const on = session.ticket !== null ? ticketKey(session.ticket) : (session.map ?? "new map");
  return `${session.agent.name} ${on}`;
}
