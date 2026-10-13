import type { TicketsTree } from "@dryland/core";

/** The tickets tree of a project, or why it cannot be read and what to do about it. */
export type TreeLoad = { ok: true; tree: TicketsTree } | { ok: false; message: string; nextAction: string };

export interface ProjectView {
  /** The path the user opened. */
  path: string;
  name: string;
  tree: TreeLoad;
}

export interface AppState {
  project: ProjectView | null;
  legendDismissed: boolean;
}

/** What the preload script exposes to the renderer as `window.dryland`. */
export interface DrylandApi {
  getState(): Promise<AppState>;
  /** Shows the folder picker; resolves with the state after it, unchanged if the user cancels. */
  openProject(): Promise<AppState>;
  dismissLegend(): Promise<void>;
  /** Called whenever tracker files change on disk. Returns an unsubscribe function. */
  onProjectChanged(callback: (project: ProjectView) => void): () => void;
}
