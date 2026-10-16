import type { SessionState } from "@dryland/core";

/** When stopping a session asks first: always, when it is busy or printed something unseen (the default), or never. */
export const STOP_CONFIRMATIONS = ["always", "busy-or-unseen", "never"] as const;
export type StopConfirmation = (typeof STOP_CONFIRMATIONS)[number];
export const DEFAULT_STOP_CONFIRMATION: StopConfirmation = "busy-or-unseen";

export const STOP_CONFIRMATION_LABELS: Record<StopConfirmation, string> = {
  always: "Always",
  "busy-or-unseen": "When It Is Working or Has Unseen Output",
  never: "Never",
};

export const isStopConfirmation = (value: unknown): value is StopConfirmation =>
  STOP_CONFIRMATIONS.includes(value as StopConfirmation);

/**
 * Whether stopping a session asks first. Under the default rule it asks when the session is working, so it is not
 * cut off mid-task, and when it has output the user has not seen, which may be a question; a quiet session stops
 * at once. A session that has ended has nothing to stop.
 */
export function stopNeedsConfirmation(rule: StopConfirmation, state: SessionState, unseen: boolean): boolean {
  if (state === "ended" || rule === "never") return false;
  return rule === "always" || state === "running" || unseen;
}
