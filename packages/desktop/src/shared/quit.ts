import type { SessionState } from "@dryland/core";

/** A session the quit dialog lists: what it works on, where, and how it is doing. */
export interface QuitListing {
  id: string;
  /** How its tab is named: the agent and what it works on. */
  title: string;
  agent: string;
  branch: string;
  state: SessionState;
  /** Whether it printed output the user has not seen. */
  unseen: boolean;
}

/** What the window is asked on a user's quit: the sessions that would stop, waiting ones first. */
export interface QuitRequest {
  sessions: QuitListing[];
}

/** What the quit dialog can answer: keep everything, stop and quit, or abandon the remaining steps and quit at once. */
export type QuitAnswer = "cancel" | "confirm" | "now";
export const isQuitAnswer = (value: unknown): value is QuitAnswer =>
  value === "cancel" || value === "confirm" || value === "now";

/** Where a shutdown step is: `pending` until it starts, `abandoned` when the user quit at once before it finished. */
export type StepState = "pending" | "running" | "done" | "failed" | "abandoned";

/** One change in the progress of a shutdown step, as the quit dialog shows it. */
export interface QuitProgress {
  step: string;
  state: StepState;
}
