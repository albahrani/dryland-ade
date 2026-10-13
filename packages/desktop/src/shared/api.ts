import type { MapDetail, TicketDetail, TicketsTree } from "@dryland/core";
import type { ItemRef, TabsState } from "./tabs.ts";

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
  /** The editor tabs last open in `project`. */
  tabs: TabsState;
}

/** What an editor tab shows; `missing` when the ticket or map is gone, or the project cannot be read. */
export type ItemContent =
  { kind: "ticket"; ticket: TicketDetail } | { kind: "map"; map: MapDetail } | { kind: "missing" };

/** What the preload script exposes to the renderer as `window.dryland`. */
export interface DrylandApi {
  getState(): Promise<AppState>;
  /** Shows the folder picker; resolves with the state after it, unchanged if the user cancels. */
  openProject(): Promise<AppState>;
  dismissLegend(): Promise<void>;
  /** Remembers the open tabs of the open project. */
  saveTabs(tabs: TabsState): Promise<void>;
  /** Reads a ticket or map fresh from the open project. */
  readItem(ref: ItemRef): Promise<ItemContent>;
  /** Called whenever tracker files change on disk. Returns an unsubscribe function. */
  onProjectChanged(callback: (project: ProjectView) => void): () => void;
}
