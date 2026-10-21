import type {
  AgentHooks,
  MergeStrategy,
  LiveEvent,
  MapDetail,
  SessionState,
  SkillSetupReport,
  Compatibility,
  TicketDetail,
  TicketRef,
  TicketsTree,
  TrackerWidgetInfo,
} from "@dryland/core";
import type { AgentHooksAction, AgentHooksChange } from "./agent-hooks.ts";
import type { TrackerWidgetAction } from "./tracker-widget.ts";
import type { ChangedFile, DiffContent, DirectoryListing, ExplorerRoot, FileContent, RootHint } from "./explorer.ts";
import type { OpenProject, ProjectSummary } from "./projects.ts";
import type { QuitAnswer, QuitProgress, QuitRequest } from "./quit.ts";
import type { NextUp } from "./next-up.ts";
import type {
  ActionResult,
  CommitGraph,
  CommitResult,
  MergeActionResult,
  MergeCheckView,
  PullRequestActionResult,
  PullRequestSection,
  SourceControlStatus,
  UnlinkedBranch,
} from "./source-control.ts";
import type { PausedSession } from "./paused-session.ts";
import type { SessionsLayout } from "./sessions-view.ts";
import type { SettingsChange } from "./settings-change.ts";
import type { StopConfirmation } from "./stop-session.ts";
import type { DocumentRef, TabsState } from "./tabs.ts";
import type { ConfirmationType, DontAsk, TicketAction } from "./tracker-actions.ts";
import type { WorkTarget } from "./work-target.ts";

/** The tickets tree of a project with its next steps, or why it cannot be read and what to do about it. */
export type TreeLoad =
  | {
      ok: true;
      tree: TicketsTree;
      nextUp: NextUp;
      /** The `map/id` of every claim no live Dryland session holds: claimed, possibly stale. */
      staleClaims: string[];
      /** The paused session of every claim one holds, by `map/id`: resumable, never stale. */
      pausedClaims: Record<string, PausedSession>;
      /** How the repo's skills and `docs/agents` files compare to the default setup. */
      skillSetup: SkillSetupReport;
      /** Whether to ask about a modified setup, and the verdict's degraded and broken features. */
      compatibility: Compatibility;
    }
  | { ok: false; message: string; nextAction: string };

export interface ProjectView {
  /** The path the user opened. */
  path: string;
  name: string;
  tree: TreeLoad;
  /** What the tracker widget shows; `null` when the tracker doc is missing or names no tracker Dryland reads. */
  tracker: TrackerWidgetInfo | null;
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
  /** The global auto-commit setting, which the open project's override, if any, wins over. */
  globalAutoCommit: boolean;
  /** The open project's auto-commit override; `null` when it has none or no project is open. */
  projectAutoCommit: boolean | null;
  /** Whether a session's pre-typed command is submitted in the open project: its override, else the global setting. */
  autoSubmit: boolean;
  /** The global auto-submit setting, which the open project's override, if any, wins over. */
  globalAutoSubmit: boolean;
  /** The open project's auto-submit override; `null` when it has none or no project is open. */
  projectAutoSubmit: boolean | null;
  dontAsk: DontAsk;
  stopConfirmation: StopConfirmation;
  /** Whether starting the app resumes every paused session, hidden. */
  resumeOnStart: boolean;
  /** Days a session stays in the session index after it was last seen. */
  sessionRetentionDays: number;
}

export interface AppState {
  project: ProjectView | null;
  /** The projects open in the app, in the order they were opened; `project` is the one shown. */
  openProjects: OpenProject[];
  legendDismissed: boolean;
  liveEventsPanel: LiveEventsPanelMode;
  /** The sessions this app started, in the order they started. */
  sessions: SessionInfo[];
  /** The state of each session this app started, by session id. */
  sessionStates: Readonly<Record<string, SessionState>>;
  /** The sessions that printed output the user has not seen, by session id. */
  unseenSessions: string[];
  /** The editor tabs last open in `project`. */
  tabs: TabsState;
  /** The Sessions view's layout last used in `project`. */
  sessionsLayout: SessionsLayout;
  settings: AppSettings;
}

/** What an editor tab shows; `missing` when the ticket or map is gone, or the project cannot be read. */
export type ItemContent =
  { kind: "ticket"; ticket: TicketDetail } | { kind: "map"; map: MapDetail } | { kind: "missing" };

/** An Agent CLI work can be started with, and whether it is installed. */
export interface AgentAvailability {
  id: string;
  name: string;
  /** First-class CLIs have verified launch and status; best-effort ones get launch and pre-typing only. */
  tier: "first-class" | "best-effort";
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
  /** The Agent CLI's own id of the session, given at launch; `null` for a CLI that cannot be told one. */
  agentSessionId: string | null;
  /** The project it belongs to: the path the user opened, as `startWork` was given it. */
  project: string;
  /** The ticket it works on; `null` for a map's own session or a new map's. */
  ticket: TicketRef | null;
  /** The map it works on: the ticket's, the map continued, or `null` for a map not yet charted. */
  map: string | null;
  worktree: { branch: string; path: string };
  /** The skill command pre-typed at launch; `null` when no next step pointed at the ticket and none was chosen. */
  command: string | null;
  /** ISO timestamp of the spawn. */
  startedAt: string;
  /**
   * Set for a session the user started by hand in a plain terminal tab (linked by its working directory): the tab
   * is a shell, which closing the tab ends, whether or not the CLI still runs in it.
   */
  manual?: true;
  /** Set for a CLI without status hooks: its state is guessed from its terminal output, and shown as approximate. */
  statusApproximate?: true;
}

/** The session work started, or why it could not start and what to do about it. */
export type StartWorkResult =
  { ok: true; session: SessionInfo; warnings: string[] } | { ok: false; message: string; nextAction: string };

/** How a paused session continues: the CLI resumes it by id, or lets the user pick a session. */
export type ResumeMode = "resume" | "pick";

/** What resuming several paused sessions together did. */
export interface ResumedAllResult {
  resumed: number;
  warnings: string[];
}

/** How a tracker write went: `dryland`'s warnings, or its error and the next action it names. */
export type TicketActionResult = { ok: true; warnings: string[] } | { ok: false; message: string; nextAction: string };

/** What the application menu asks of the window: the dialogs that live in the renderer. */
export type MenuCommand = "new-ticket" | "new-map" | "new-scratch" | "settings" | "about";

/** What the preload script exposes to the renderer as `window.dryland`. */
export interface DrylandApi {
  getState(): Promise<AppState>;
  /** Shows the folder picker; resolves with the state after it, unchanged if the user cancels. */
  openProject(): Promise<AppState>;
  /** Shows another open project, leaving its sessions and the current project's running. */
  switchProject(path: string): Promise<AppState>;
  /** Closes an open project and ends its sessions and terminals; shows the next open project. */
  closeProject(path: string): Promise<AppState>;
  /** Each open project's tracker, live session count and next-up item. */
  projectSummaries(): Promise<ProjectSummary[]>;
  dismissLegend(): Promise<void>;
  /** Carries out the tracker widget's action; resolves with what went wrong, or `null`. */
  trackerWidgetAction(kind: TrackerWidgetAction["kind"]): Promise<string | null>;
  /** Remembers how much of the live-events panel shows. */
  setLiveEventsPanel(mode: LiveEventsPanelMode): Promise<void>;
  /** Remembers the open tabs of the open project. */
  saveTabs(tabs: TabsState): Promise<void>;
  /** Remembers the Sessions view's layout in the open project. */
  saveSessionsLayout(layout: SessionsLayout): Promise<void>;
  /** Reads a ticket or map fresh from the open project. */
  readItem(ref: DocumentRef): Promise<ItemContent>;
  /** The worktree the Explorer shows for a selection; the main checkout when the selection has no worktree. */
  explorerRoot(hint: RootHint): Promise<ExplorerRoot>;
  /** The entries of directory `dir` (`""` for the top) of a worktree, a directory at a time. */
  explorerList(root: string, dir: string): Promise<DirectoryListing>;
  /** A file of a worktree, read fresh; large files come cut and binary ones not at all. */
  explorerRead(root: string, path: string): Promise<FileContent>;
  /** The files changed in a worktree since its base, uncommitted and untracked ones included. */
  explorerChanges(root: string): Promise<ChangedFile[]>;
  /** `git diff` of one changed file against the worktree's base. */
  explorerDiff(root: string, path: string): Promise<DiffContent>;
  /** Watches exactly these directories of a worktree (`""` is its top); `onExplorerChanged` fires when they change. */
  explorerWatch(root: string, dirs: string[]): Promise<void>;
  /** The staged and the changed files of a worktree, against its HEAD. */
  sourceControlStatus(root: string): Promise<SourceControlStatus>;
  /** The worktree branch's commits relative to the default branch. */
  sourceControlGraph(root: string): Promise<CommitGraph>;
  /** The project's worktrees that no ticket link covers. */
  sourceControlUnlinked(): Promise<UnlinkedBranch[]>;
  sourceControlStage(root: string, paths: string[]): Promise<void>;
  sourceControlUnstage(root: string, paths: string[]): Promise<void>;
  /** Commits what is staged in that worktree with `message`. */
  sourceControlCommit(root: string, message: string): Promise<CommitResult>;
  /** The dry run for merging the worktree's branch into the default branch: blockers and hints. */
  sourceControlMergeCheck(root: string): Promise<MergeCheckView>;
  /** Merges the worktree's branch with a strategy, then, with `cleanup`, prunes it when the prune conditions hold. */
  sourceControlMerge(root: string, strategy: MergeStrategy, cleanup: boolean): Promise<MergeActionResult>;
  /** Removes the worktree and branch; the caller has confirmed. Refused, naming the failed condition, unless safe. */
  sourceControlPrune(root: string): Promise<ActionResult>;
  /** Pre-types a prompt about the branch's merge conflicts into the worktree's live session; changes no file. */
  sourceControlHandToAgent(root: string): Promise<ActionResult>;
  /** The PR/MR section of the worktree: the existing request or what stops opening one; `null` without a forge. */
  sourceControlPullRequest(root: string): Promise<PullRequestSection | null>;
  /** Pushes the branch and opens a PR/MR through `gh`/`glab` after the dry-run checks. */
  sourceControlOpenPullRequest(root: string): Promise<PullRequestActionResult>;
  /** Called after files change in the watched directories. Returns an unsubscribe function. */
  onExplorerChanged(callback: () => void): () => void;
  /** Starts a shell in the open project's main checkout; resolves with its id, or `null` without a project. */
  openTerminal(): Promise<string | null>;
  /** The Agent CLIs work can start with, and whether each is installed. */
  listAgents(): Promise<AgentAvailability[]>;
  /** The skills the Agent CLI has installed for the open project, by name; empty without a project. */
  listSkills(agentId: string): Promise<string[]>;
  /**
   * Opens the Agent CLI in a new terminal, in the target's worktree, with the recommended command typed: a ticket's
   * next step, `/wayfinder <map>` for a map, `/wayfinder ` for a new map. With `skill`, that skill's command instead.
   */
  startWork(target: WorkTarget, agentId: string, skill: string | null): Promise<StartWorkResult>;
  /**
   * What starting work with the Agent CLI would first write to the user's own config for it, as a sentence to
   * confirm; `null` when nothing new. Asked before `startWork`, which makes the write.
   */
  pendingUserConfigWrite(agentId: string): Promise<string | null>;
  /**
   * Continues a ticket's paused session in a new terminal ('resume'), or opens the CLI's own picker in the ticket's
   * worktree ('pick'), which is also what a session the CLI no longer has falls back to, with a warning saying so.
   */
  resumeSession(ticket: TicketRef, mode: ResumeMode): Promise<StartWorkResult>;
  /**
   * Resumes the paused sessions of the open project, or of one map, as hidden sessions: no tab opens. Each one
   * reaches `onSessionsStarted`; resolves with how many started and what went wrong with the rest.
   */
  resumeAll(map: string | null): Promise<ResumedAllResult>;
  /** Runs a ticket action through `dryland` in the open project; asking for confirmation is the caller's part. */
  runTicketAction(action: TicketAction, commit: boolean): Promise<TicketActionResult>;
  /** Stops asking for confirmations of `type`, until it is reset. */
  dontAskAgain(type: ConfirmationType): Promise<void>;
  /** Accepts the deviations of the project's modified skill setup; the dialog stays away until the setup changes. */
  acceptDeviations(): Promise<void>;
  /** Forgets the accepted deviations, so the modified-setup dialog asks again (unless a valid verdict exists). */
  revokeDeviations(): Promise<void>;
  /** What Dryland keeps in the user's own config for the CLI; `null` when the CLI keeps none there. */
  agentHooks(agentId: string): Promise<AgentHooks | null>;
  /** Installs or removes that config, as `dryland doctor --install-hooks`/`--remove-hooks` would; the caller has confirmed. */
  changeAgentHooks(agentId: string, action: AgentHooksAction): Promise<AgentHooksChange | null>;
  /** Turns a rule the Compatibility verdict calls broken back on (`true`) or off again. */
  overrideRule(ruleId: string, enabled: boolean): Promise<void>;
  /** Applies a change made in the Settings dialog; the new settings reach `onSettingsChanged`. */
  changeSetting(change: SettingsChange): Promise<void>;
  writeTerminal(id: string, data: string): void;
  resizeTerminal(id: string, cols: number, rows: number): void;
  /** Kills the terminal's process; a session's terminal is left running, hidden, until its session is stopped. */
  closeTerminal(id: string): void;
  /** Tells which terminal is in view, `null` when none is: output elsewhere marks its session unseen. */
  viewTerminal(id: string | null): void;
  /** The newest output of a live terminal, to show again in a new view; `null` once its process has ended. */
  replayTerminal(id: string): Promise<string | null>;
  /** Kills a session's Agent CLI; its claim and its session index entry stay, so it can be resumed. */
  stopSession(sessionId: string): Promise<void>;
  /** Answers the quit dialog: keep everything, stop and quit, or ("now") abandon the remaining steps and quit at once. */
  answerQuit(answer: QuitAnswer): Promise<void>;
  /** Called when the user quits while sessions run, with what would stop; the window shows the question. */
  onQuitRequest(callback: (request: QuitRequest) => void): () => void;
  /** Called with each shutdown step's progress after the quit is confirmed. Returns an unsubscribe function. */
  onQuitProgress(callback: (progress: QuitProgress) => void): () => void;
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
  /** Called when a menu item asks the window to open one of its dialogs. Returns an unsubscribe function. */
  onMenuCommand(callback: (command: MenuCommand) => void): () => void;
  /** Called with every session's state whenever one changes. Returns an unsubscribe function. */
  onSessionStates(callback: (states: Readonly<Record<string, SessionState>>) => void): () => void;
  /** Called with a message for the user the main process has no dialog for, such as sessions that did not resume. */
  onNotice(callback: (message: string) => void): () => void;
  /** Called with sessions the main process started on its own, such as by Resume all. Returns an unsubscribe function. */
  onSessionsStarted(callback: (sessions: SessionInfo[]) => void): () => void;
  /** Called with the sessions that have unseen output whenever that changes. Returns an unsubscribe function. */
  onUnseenSessions(callback: (sessionIds: string[]) => void): () => void;
}
