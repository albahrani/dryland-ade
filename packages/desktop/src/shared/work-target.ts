import type { TicketRef } from "@dryland/core";
import { isRecord, isTicketRef, MAP_NAME } from "./tracker-actions.ts";
import { ticketKey } from "./tabs.ts";

/**
 * What a session starts on: a ticket, a map to continue, a map the `/wayfinder` skill has yet to chart, or nothing
 * (exploratory work in a scratch worktree of its own).
 */
export type WorkTarget =
  { kind: "ticket"; ticket: TicketRef } | { kind: "map"; map: string } | { kind: "new-map" } | { kind: "scratch" };

/** The effort a ticketless session's worktree is named after, as `scratch/scratch-session`. */
export const SCRATCH_EFFORT = "scratch";

/** The name part of a ticketless session's scratch worktree. */
export const SCRATCH_SLUG = "session";

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
    case "scratch":
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
    case "scratch":
      return `/${skill} `;
  }
}

/** Whether a session with no ticket or map works in a ticketless session's scratch worktree. */
export const isScratch = (session: { map: string | null; worktree?: { branch: string } }): boolean =>
  session.map === null && session.worktree?.branch.startsWith(`${SCRATCH_EFFORT}/`) === true;

/** How a session's tab is named: its agent and what it works on. */
export function sessionTitle(session: {
  agent: { name: string };
  ticket: TicketRef | null;
  map: string | null;
  worktree?: { branch: string };
  manual?: true;
}): string {
  const unnamed = isScratch(session) ? "scratch" : session.manual ? "unlinked" : "new map";
  const on = session.ticket !== null ? ticketKey(session.ticket) : (session.map ?? unnamed);
  return `${session.agent.name} ${on}`;
}
