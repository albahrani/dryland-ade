import type { LiveEvent, MapDetail, SessionState, TicketDetail, TicketRef, TicketsTree } from "@dryland/core";
import type { NextUp } from "./next-up.ts";
import type { DocumentRef, TabsState } from "./tabs.ts";
import type { ConfirmationType, DontAsk, TicketAction } from "./tracker-actions.ts";

/** The tickets tree of a project with its next steps, or why it cannot be read and what to do about it. */
export type TreeLoad =
  | {
      ok: true;
      tree: TicketsTree;
      nextUp: NextUp;
      /** The `map/id` of every claim no live Dryland session holds: claimed, possibly stale. */
      staleClaims: string[];
    }
  | { ok: false; message: string; nextAction: string };

export interface ProjectView {
  /** The path the user opened. */
  path: string;
  name: string;
  tree: TreeLoad;
}

/** How much of the live-events panel shows: all of it, its newest line, or nothing. */
export const LIVE_EVENTS_PANEL_MODES = ["expanded", "line", "hidden"] as const;
export type LiveEventsPanelMode = (typeof LIVE_EVENTS_PANEL_MODES)[number];
export const isLiveEventsPanelMode = (value: unknown): value is LiveEventsPanelMode =>
  LIVE_EVENTS_PANEL_MODES.includes(value as LiveEventsPanelMode);

/** The settings the renderer acts on. */
export interface AppSettings {
  /** Whether tracker writes in the open project are committed: its override, else the global setting. */
  autoCommit: boolean;
  dontAsk: DontAsk;
}

export interface AppState {
  project: ProjectView | null;
  legendDismissed: boolean;
  liveEventsPanel: LiveEventsPanelMode;
  /** The sessions this app started, in the order they started. */
  sessions: SessionInfo[];
  /** The state of each session this app started, by session id. */
  sessionStates: Readonly<Record<string, SessionState>>;
  /** The editor tabs last open in `project`. */
  tabs: TabsState;
  settings: AppSettings;
}

/** What an editor tab shows; `missing` when the ticket or map is gone, or the project cannot be read. */
export type ItemContent =
  { kind: "ticket"; ticket: TicketDetail } | { kind: "map"; map: MapDetail } | { kind: "missing" };

/** An Agent CLI work can be started with, and whether it is installed. */
export interface AgentAvailability {
  id: string;
  name: string;
  available: boolean;
  /** Why it is unavailable; `null` when it is available. */
  reason: string | null;
}

/** A session Dryland started, as recorded at spawn. */
export interface SessionInfo {
  /** `DRYLAND_SESSION_ID` of the session. */
  id: string;
  /** The terminal it runs in, which is also its `DRYLAND_PANE_KEY`. */
  terminalId: string;
  agent: { id: string; name: string };
  ticket: TicketRef;
  worktree: { branch: string; path: string };
  /** The skill command pre-typed at launch; `null` when no next step pointed at the ticket. */
  command: string | null;
  /** ISO timestamp of the spawn. */
  startedAt: string;
}

/** The session work started, or why it could not start and what to do about it. */
export type StartWorkResult =
  { ok: true; session: SessionInfo; warnings: string[] } | { ok: false; message: string; nextAction: string };

/** How a tracker write went: `dryland`'s warnings, or its error and the next action it names. */
export type TicketActionResult = { ok: true; warnings: string[] } | { ok: false; message: string; nextAction: string };

/** What the preload script exposes to the renderer as `window.dryland`. */
export interface DrylandApi {
  getState(): Promise<AppState>;
  /** Shows the folder picker; resolves with the state after it, unchanged if the user cancels. */
  openProject(): Promise<AppState>;
  dismissLegend(): Promise<void>;
  /** Remembers how much of the live-events panel shows. */
  setLiveEventsPanel(mode: LiveEventsPanelMode): Promise<void>;
  /** Remembers the open tabs of the open project. */
  saveTabs(tabs: TabsState): Promise<void>;
  /** Reads a ticket or map fresh from the open project. */
  readItem(ref: DocumentRef): Promise<ItemContent>;
  /** Starts a shell in the open project's main checkout; resolves with its id, or `null` without a project. */
  openTerminal(): Promise<string | null>;
  /** The Agent CLIs work can start with, and whether each is installed. */
  listAgents(): Promise<AgentAvailability[]>;
  /** Opens the Agent CLI in the ticket's worktree with its next-step command typed, in a new terminal. */
  startWork(ticket: TicketRef, agentId: string): Promise<StartWorkResult>;
  /** Runs a ticket action through `dryland` in the open project; asking for confirmation is the caller's part. */
  runTicketAction(action: TicketAction): Promise<TicketActionResult>;
  /** Stops asking for confirmations of `type`, until it is reset. */
  dontAskAgain(type: ConfirmationType): Promise<void>;
  writeTerminal(id: string, data: string): void;
  resizeTerminal(id: string, cols: number, rows: number): void;
  /** Kills the terminal's process. */
  closeTerminal(id: string): void;
  /** Called with output of any terminal. Returns an unsubscribe function. */
  onTerminalData(callback: (id: string, data: string) => void): () => void;
  /** Called when a terminal's process ends by itself. Returns an unsubscribe function. */
  onTerminalExit(callback: (id: string, exitCode: number) => void): () => void;
  /** Called whenever tracker files change on disk. Returns an unsubscribe function. */
  onProjectChanged(callback: (project: ProjectView) => void): () => void;
  /** Called with every live event the app receives. Returns an unsubscribe function. */
  onLiveEvent(callback: (event: LiveEvent) => void): () => void;
  /** Called with the settings whenever they change, such as from the menu. Returns an unsubscribe function. */
  onSettingsChanged(callback: (settings: AppSettings) => void): () => void;
  /** Called with every session's state whenever one changes. Returns an unsubscribe function. */
  onSessionStates(callback: (states: Readonly<Record<string, SessionState>>) => void): () => void;
}
