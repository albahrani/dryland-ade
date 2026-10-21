import { parsePanelFolded, parsePanelWidths } from "../shared/panel-widths.ts";
import { basename, join } from "node:path";
import {
  type CompatConfig,
  MERGE_STRATEGIES,
  NO_COMPAT_CONFIG,
  readSkillSetup,
  type MergeStrategy,
  AGENT_ADAPTERS,
  hasStatusHooks,
  DrylandError,
  findMainCheckout,
  type LiveEvent,
  type LiveListener,
  type SessionSnapshot,
  liveLockFile,
  NEXT_UP_COUNT,
  nextSteps,
  nextUpMarkers,
  nodeProcessRunner,
  readMapDetail,
  readProjectState,
  readTrackerWidget,
  readSessionIndex,
  resumeArgs,
  sessionsOf,
  readTicketDetail,
  reconcileSessionIndex,
  SESSION_RETENTION_ENV,
  startLiveListener,
} from "@dryland/core";
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, powerMonitor, shell } from "electron";
import {
  type AppSettings,
  type AppState,
  isLiveEventsPanelMode,
  type ItemContent,
  type MenuCommand,
  type ProjectView,
  type ResumedAllResult,
  type SessionInfo,
  type StartWorkResult,
  type TicketActionResult,
  type TreeLoad,
} from "../shared/api.ts";
import {
  addProject,
  closeProject as closedProjects,
  liveSessionCount,
  type ProjectSummary,
  projectSessions,
} from "../shared/projects.ts";
import { DEFAULT_SESSIONS_LAYOUT, parseSessionsLayout } from "../shared/sessions-view.ts";
import { type DocumentRef, EMPTY_TABS, parseTabs, type TabsState, ticketKey } from "../shared/tabs.ts";
import {
  autoCommitFor,
  isConfirmationType,
  isTicketAction,
  isTicketRef,
  trackerArgs,
} from "../shared/tracker-actions.ts";
import { createDrylandCli } from "./dryland-cli.ts";
import { latestOnly } from "./latest-only.ts";
import { installLayout, removeStaleLauncher } from "./install-layout.ts";
import { writeLauncher } from "./launcher.ts";
import {
  quitConfirmation,
  quitListing,
  runShutdown,
  SHUTDOWN_BUDGET_MS,
  type ShutdownHooks,
  type ShutdownStep,
  shutdownSteps,
  whoAsks,
} from "./lifecycle.ts";
import { isQuitAnswer, type QuitListing, type QuitRequest } from "../shared/quit.ts";
import { nodePtyProvider } from "./pty/node-pty-provider.ts";
import { createTerminalManager } from "./terminals.ts";
import { resolveShell } from "./shell.ts";
import { TrackerPoller } from "./tracker-poller.ts";
import { runTrackerWidgetAction } from "./tracker-widget-action.ts";
import { pausedTickets } from "../shared/paused-session.ts";
import { resumeAll } from "./resume-all.ts";
import { createSessionRecorder } from "./session-recording.ts";
import { ACTIVITY_QUIET_MS, createActivityStatus } from "./activity-status.ts";
import { createSessionStatus } from "./session-status.ts";
import { createElectronUpdateSource } from "./electron-update-source.ts";
import { createUpdater } from "./updates.ts";
import { isUpdateChannel, updateMode } from "../shared/updates.ts";
import { createUiStateStore, type UiState } from "./ui-state.ts";
import { createUnseenOutput } from "./unseen-output.ts";
import { autoSubmitFor, isSettingsChange, settingsPatch } from "../shared/settings-change.ts";
import { createExplorer } from "./explorer.ts";
import { createExplorerWatcher } from "./explorer-watch.ts";
import { createSourceControl } from "./source-control.ts";
import { watchProject } from "./watch-project.ts";
import { createWorkStarter, homeOf } from "./work.ts";
import { createAgentHooksControl } from "./agent-hooks.ts";
import { isAgentHooksAction } from "../shared/agent-hooks.ts";
import { isRootHint } from "../shared/explorer.ts";
import { isSkillChoice, isWorkTarget } from "../shared/work-target.ts";

/** How often the app asks the updater whether a daily check is due. */
const UPDATE_TICK_MS = 60 * 60 * 1000;

/** A terminal can print after its window is gone, between the window closing and the app quitting. */
function sendToWindow(channel: string, ...args: unknown[]): void {
  if (window !== null && !window.isDestroyed()) window.webContents.send(channel, ...args);
}

/** What terminals and sessions inherit: this process's environment plus how to reach the live listener. */
const ptyEnv: Record<string, string | undefined> = { ...process.env };
const terminals = createTerminalManager({
  provider: nodePtyProvider,
  shell: resolveShell(process.platform, process.env),
  env: ptyEnv,
  onData: (id, data) => {
    sendToWindow("terminal:data", id, data);
    const session = sessionIn(id);
    if (session?.statusApproximate) activity.output(session.id);
    if (session !== undefined && unseen.output(session.id)) sendUnseen();
  },
  onExit: (id, exitCode) => {
    sendToWindow("terminal:exit", id, exitCode);
    shellProjects.delete(id);
    terminalEnded(id);
  },
});
const store = createUiStateStore(join(app.getPath("userData"), "ui-state.json"));
// Sessions find `dryland` in the install directory, or in `shimDir` when the app is not installed (ADR 0004).
const shimDir = join(app.getPath("userData"), "bin");
const layout = installLayout({
  packaged: app.isPackaged,
  resourcesPath: process.resourcesPath,
  builtCli: join(import.meta.dirname, "dryland.js"),
  userDataBin: shimDir,
});
// Every tracker write the app makes runs this, the same CLI sessions and the user run (ADR 0003).
const dryland = createDrylandCli({
  runtime: process.execPath,
  cli: layout.cli,
  env: ptyEnv,
});
// A found update is shown as a notice; a failed check stays in the Updates tab and never interrupts the user.
const updater = createUpdater({
  source: createElectronUpdateSource(),
  mode: updateMode({
    platform: process.platform,
    packaged: app.isPackaged,
    appImage: process.env["APPIMAGE"] !== undefined,
  }),
  version: app.getVersion(),
  now: Date.now,
  saved: {
    channel: () => store.read().updateChannel,
    lastCheck: () => store.read().lastUpdateCheck,
    setChannel: (updateChannel) => void store.update({ updateChannel }),
    setLastCheck: (lastUpdateCheck) => void store.update({ lastUpdateCheck }),
  },
  onChange(state) {
    sendToWindow("updates:changed", state);
    const { status } = state;
    if (status.kind === "ready")
      sendToWindow("notice", `Dryland ADE ${status.version} was downloaded and installs when you quit.`);
    else if (status.kind === "available")
      sendToWindow("notice", `Dryland ADE ${status.version} is available: ${status.url}`);
  },
});
const autoCommit = (projectPath: string) => autoCommitFor(store.read(), projectPath);
const autoSubmit = (projectPath: string) => autoSubmitFor(store.read(), projectPath);
const compatConfig = (projectPath: string) => store.read().compat[projectPath] ?? NO_COMPAT_CONFIG;
const work = createWorkStarter({
  terminals,
  runner: nodeProcessRunner,
  env: ptyEnv,
  launcherDirs: layout.pathDirs,
  hooksDir: join(app.getPath("userData"), "hooks"),
  dryland,
  autoCommit,
  autoSubmit,
  compatConfig,
});
const agentHooks = createAgentHooksControl({
  runner: nodeProcessRunner,
  env: ptyEnv,
  home: homeOf(ptyEnv) ?? undefined,
});
let window: BrowserWindow | null = null;
let project: { path: string } | null = null;
let stopWatching: (() => void) | null = null;
let live: LiveListener | null = null;

const status = createSessionStatus();
// A CLI without hooks reports no state of its own: it is guessed from its output and shown as approximate.
const activity = createActivityStatus({
  quietMs: ACTIVITY_QUIET_MS,
  report: (sessionId, state) => {
    if (!status.observe(sessionId, state)) return;
    sendSessionStates();
    void refresh();
  },
});
// The session index is a cache: a write that fails is logged, never shown as an error.
const recorder = createSessionRecorder({
  runner: nodeProcessRunner,
  sessions: () => work.sessions(),
  warn: (message) => console.warn(message),
  retentionDays: () => store.read().sessionRetentionDays,
});
const sendSessionStates = () => sendToWindow("sessions:states", status.states());
const unseen = createUnseenOutput();
const sendUnseen = () => sendToWindow("sessions:unseen", unseen.ids());

/** The project each plain terminal was opened in, by terminal id. */
const shellProjects = new Map<string, string>();

/** The session running in terminal `id`, if one does. */
const sessionIn = (id: string) => work.sessions().find((s) => s.terminalId === id);

function settings(): AppSettings {
  const saved = store.read();
  return {
    autoCommit: project === null ? saved.autoCommit : autoCommitFor(saved, project.path),
    globalAutoCommit: saved.autoCommit,
    projectAutoCommit: project === null ? null : (saved.projectAutoCommit[project.path] ?? null),
    autoSubmit: project === null ? saved.autoSubmit : autoSubmitFor(saved, project.path),
    globalAutoSubmit: saved.autoSubmit,
    projectAutoSubmit: project === null ? null : (saved.projectAutoSubmit[project.path] ?? null),
    dontAsk: saved.dontAsk,
    stopConfirmation: saved.stopConfirmation,
    resumeOnStart: saved.resumeOnStart,
    sessionRetentionDays: saved.sessionRetentionDays,
  };
}
const sendSettings = () => sendToWindow("settings:changed", settings());

/** The sessions this app started, as the next-step rules read them: a waiting one ranks first, and one that is gone
 * leaves its claim possibly stale. */
function liveSessions(path: string): SessionSnapshot[] {
  const states = status.states();
  return projectSessions(work.sessions(), path).map(({ id, ticket }) => ({
    id,
    ticket,
    state: states[id] ?? "launched",
  }));
}

/**
 * Resumes the paused sessions of the open project, or of one map, hidden: the window learns of them but opens no tab.
 * One after another, so the CLIs do not all start at once.
 */
async function resumeAllPaused(map: string | null): Promise<ResumedAllResult> {
  if (project === null) return { resumed: 0, warnings: ["No project is open."] };
  const { path } = project;
  const { tree } = await loadTree(path);
  if (!tree.ok) return { resumed: 0, warnings: [`${tree.message} ${tree.nextAction}`] };
  const { sessions, warnings } = await resumeAll(pausedTickets(tree.pausedClaims, map), async (ticket) => {
    const started = await work.resumeSession(path, ticket, "resume");
    status.launched(started.session.id);
    return started;
  });
  if (sessions.length > 0) {
    sendToWindow("sessions:started", sessions);
    sendSessionStates();
    // Their claims are held by live sessions again, so they no longer read as paused.
    void refresh();
  }
  return { resumed: sessions.length, warnings };
}

/** Ends the session in terminal `id`, if one runs there: its CLI exited, or Dryland closed the terminal. */
function terminalEnded(id: string): void {
  const session = sessionIn(id);
  if (session === undefined) return;
  activity.forget(session.id);
  status.exited(session.id);
  sendSessionStates();
  if (unseen.forget(session.id)) sendUnseen();
  // Its commits landed in a worktree the file watcher does not see; the git-fed next steps may have moved.
  void refresh();
}

/** Live events in the order they came, so one that adopts a hand-started session finishes before the next. */
let liveEvents = Promise.resolve();

/** Shows every live event; a ticket change also re-reads the tree, even where the file watcher missed it. */
function onLiveEvent(event: LiveEvent): void {
  sendToWindow("live:event", event);
  liveEvents = liveEvents.then(() => applyLiveEvent(event)).catch((error: unknown) => console.warn(error));
}

/**
 * A CLI started by hand in a Dryland terminal reports from a session Dryland did not start; the first event it sends
 * makes it one, linked by its working directory.
 */
async function adoptHandStarted(event: LiveEvent): Promise<void> {
  if (project === null || event.pane === undefined) return;
  // The current project first; the shell may as well run in another open project.
  let session: SessionInfo | null = null;
  for (const path of [project.path, ...store.read().openProjects.filter((p) => p !== project?.path)]) {
    session = await work.adoptManual(path, event);
    if (session !== null) break;
  }
  if (session === null) return;
  status.launched(session.id);
  sendToWindow("sessions:started", [session]);
  sendSessionStates();
}

async function applyLiveEvent(event: LiveEvent): Promise<void> {
  await adoptHandStarted(event);
  recorder.apply(event);
  const stateChanged = status.apply(event);
  if (stateChanged) sendSessionStates();
  // A session's state moves the next steps too: a waiting one ranks first.
  if (stateChanged || event.kind === "ticket.changed") void refresh();
}

async function loadTree(path: string): Promise<{ tree: TreeLoad; mainCheckout: string | null }> {
  // Kept when only the tracker read fails (e.g. `gh` logged out), so the project is still watched and polled.
  let found: string | null = null;
  try {
    const mainCheckout = (found = await findMainCheckout(nodeProcessRunner, path));
    // One pass over the tracker files feeds both the tree and the rule engine, so markers and rows never disagree.
    const { tree, snapshot, skillSetup, compatibility } = await readProjectState(
      nodeProcessRunner,
      mainCheckout,
      liveSessions(path),
      compatConfig(path),
    );
    const steps = nextSteps(snapshot);
    const ranked = nextUpMarkers(steps, Infinity);
    const nextUp = { markers: ranked.slice(0, NEXT_UP_COUNT), ranked };
    const staleClaims = steps.flatMap(({ ruleId, target }) =>
      ruleId === "stale-claim" && target.kind === "ticket" ? [ticketKey(target)] : [],
    );
    const index = (await readSessionIndex(nodeProcessRunner, mainCheckout)).index;
    const claimants = new Map(
      tree.maps.flatMap((m) =>
        [...m.planning, ...m.implementation, ...m.done].map((t) => [ticketKey(t), t.claimant] as const),
      ),
    );
    const pausedClaims = Object.fromEntries(
      (snapshot.sessions ?? []).flatMap((s) => {
        if (s.state !== "paused") return [];
        const key = ticketKey(s.ticket);
        const known = sessionsOf(index, key)[0];
        const adapter = AGENT_ADAPTERS.find((a) => a.id === known?.adapter);
        return [
          [
            key,
            {
              sessionId: s.id,
              agentId: known?.adapter ?? "",
              agent: adapter?.name ?? known?.adapter ?? "agent",
              resumeCommand:
                adapter === undefined ? null : [adapter.binary, ...(resumeArgs(adapter, s.id) ?? [])].join(" "),
              was: s.was,
              lastSeen: known?.lastSeen ?? "",
              branch: claimants.get(key) ?? null,
            },
          ],
        ];
      }),
    );
    return { tree: { ok: true, tree, nextUp, staleClaims, pausedClaims, skillSetup, compatibility }, mainCheckout };
  } catch (error) {
    if (!(error instanceof DrylandError)) throw error;
    return { tree: { ok: false, message: error.message, nextAction: error.nextAction }, mainCheckout: found };
  }
}

async function projectView(): Promise<{ view: ProjectView; mainCheckout: string | null } | null> {
  if (project === null) return null;
  const { tree, mainCheckout } = await loadTree(project.path);
  const tracker = mainCheckout === null ? null : await readTrackerWidget(nodeProcessRunner, mainCheckout);
  return { view: { path: project.path, name: basename(project.path), tree, tracker }, mainCheckout };
}

async function currentState(): Promise<AppState> {
  const { legendDismissed, tabs, sessionsLayout, liveEventsPanel, panelWidths, panelFolded } = store.read();
  const view = (await projectView())?.view ?? null;
  return {
    project: view,
    openProjects: store.read().openProjects.map((path) => ({ path, name: basename(path) })),
    legendDismissed,
    liveEventsPanel,
    panelWidths,
    panelFolded,
    tabs: (view && tabs[view.path]) || EMPTY_TABS,
    sessionsLayout: (view && sessionsLayout[view.path]) || DEFAULT_SESSIONS_LAYOUT,
    sessions: work.sessions(),
    sessionStates: status.states(),
    unseenSessions: unseen.ids(),
    settings: settings(),
  };
}

async function readItem(ref: DocumentRef): Promise<ItemContent> {
  if (project === null) return { kind: "missing" };
  try {
    const mainCheckout = await findMainCheckout(nodeProcessRunner, project.path);
    if (ref.kind === "map") {
      const map = await readMapDetail(mainCheckout, ref.name);
      return map === null ? { kind: "missing" } : { kind: "map", map };
    }
    const ticket = await readTicketDetail(mainCheckout, ref.map, ref.id);
    return ticket === null ? { kind: "missing" } : { kind: "ticket", ticket };
  } catch (error) {
    if (!(error instanceof DrylandError)) throw error;
    return { kind: "missing" };
  }
}

/** Makes `path` the open project and starts watching its tracker files. Remembers it only if it loads. */
async function openProject(path: string): Promise<void> {
  stopWatching?.();
  stopWatching = null;
  explorerWatcher.stop();
  project = { path };
  const loaded = await projectView();
  if (loaded?.view.tree.ok) {
    store.update({ lastProject: path, openProjects: addProject(store.read().openProjects, path) });
  }
  if (loaded?.mainCheckout) stopWatching = watchProject(loaded.mainCheckout, () => void refresh());
  // A GitHub or GitLab project has no files to watch, so its tickets are polled instead.
  if (loaded?.view.tracker) trackerPoller.start(loaded.view.tracker.kind);
  else trackerPoller.stop();
  // The project's auto-commit override shows in the menu and decides its writes.
  buildMenu();
  sendSettings();
}

let reconciling = false;
let lastReconciled = 0;
/** Focus comes in bursts (alt-tabbing, dialogs); a reconcile this recent already saw what a new one would. */
const RECONCILE_MIN_INTERVAL_MS = 3000;

/**
 * Brings the session index in line with the tracker, git and Claude Code's history, in this process and never the
 * renderer. One run at a time; the window re-reads the project only when the index changed. The index is a cache, so
 * a failure is logged, never shown.
 */
async function reconcileSessions(): Promise<void> {
  if (project === null || reconciling || Date.now() - lastReconciled < RECONCILE_MIN_INTERVAL_MS) return;
  reconciling = true;
  try {
    const { changed, warnings } = await reconcileSessionIndex(nodeProcessRunner, project.path, {
      retentionDays: store.read().sessionRetentionDays,
    });
    warnings.forEach((message) => console.warn(message));
    if (changed) void refresh();
  } catch (error) {
    if (!(error instanceof DrylandError)) console.warn("The session index was not reconciled.", error);
  } finally {
    reconciling = false;
    lastReconciled = Date.now();
  }
}

/** Re-reads the project and sends it to the window; a read overtaken by a newer one is dropped, not sent late. */
const refresh = latestOnly(projectView, (loaded) => {
  if (loaded !== null) sendToWindow("project:changed", loaded.view);
});

const trackerPoller = new TrackerPoller(refresh);

async function pickProject(): Promise<void> {
  if (window === null) return;
  const result = await dialog.showOpenDialog(window, { title: "Open project", properties: ["openDirectory"] });
  const [path] = result.filePaths;
  if (result.canceled || path === undefined) return;
  // Sessions and terminals of the project shown so far keep running: switching never interrupts an agent.
  await openProject(path);
}

/** Ends every session and terminal of project `path`; the manager reports no exit for terminals it closes. */
function stopProject(path: string): void {
  const sessions = projectSessions(work.sessions(), path);
  const shells = [...shellProjects].flatMap(([id, owner]) => (owner === path ? [id] : []));
  for (const { terminalId } of sessions) terminals.close(terminalId);
  for (const id of shells) {
    terminals.close(id);
    shellProjects.delete(id);
  }
  sessions.forEach(({ terminalId }) => terminalEnded(terminalId));
}

/** Closes project `path`: its sessions and terminals end, and the next open project, if any, is shown. */
async function closeOpenProject(path: string): Promise<void> {
  const saved = store.read();
  if (!saved.openProjects.includes(path)) return;
  stopProject(path);
  const { open, current } = closedProjects(saved.openProjects, path, project?.path ?? null);
  store.update({ openProjects: open });
  if (project?.path !== path) return;
  if (current !== null) return openProject(current);
  stopWatching?.();
  stopWatching = null;
  explorerWatcher.stop();
  project = null;
  trackerPoller.stop();
  store.update({ lastProject: null });
  buildMenu();
  sendSettings();
}

/** What the All Projects dialog shows of each open project. */
async function projectSummaries(): Promise<ProjectSummary[]> {
  const running = new Set(terminals.liveIds());
  const sessions = work.sessions().filter((s) => running.has(s.terminalId));
  const states = status.states();
  return Promise.all(
    store.read().openProjects.map(async (path): Promise<ProjectSummary> => {
      const { tree } = await loadTree(path);
      const base = { path, name: basename(path), liveSessions: liveSessionCount(sessions, states, path) };
      return tree.ok
        ? { ...base, tracker: "Local markdown", nextUp: tree.nextUp.markers[0] ?? null, error: null }
        : { ...base, tracker: null, nextUp: null, error: `${tree.message} ${tree.nextAction}` };
    }),
  );
}

function createWindow(): void {
  // The UI is dark only, so the window frame, menus and native dialogs follow it, not the system setting.
  nativeTheme.themeSource = "dark";
  window = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "Dryland ADE",
    webPreferences: { preload: join(import.meta.dirname, "../preload/index.cjs"), sandbox: true },
  });
  // Closing the window quits the app, so it asks first, like any other quit, and a cancel keeps the window.
  window.on("close", (event) => {
    if (quit === "allowed") return;
    event.preventDefault();
    app.quit();
  });
  // Windows ends the app soon after; the PTYs are killed before the first await of the shutdown.
  window.on("session-end", () => void shutDown());
  window.on("closed", () => (window = null));
  // A reload drops the quit dialog the window was showing; the next quit asks again.
  window.webContents.on("did-start-loading", () => {
    if (askedInWindow && abandonQuit === null) quit = "ask";
    askedInWindow = false;
  });
  // Git state behind the next steps changes outside the watched tracker files, e.g. a commit made in a terminal.
  window.on("focus", () => {
    // A polled remote project re-reads through the poller, which never overlaps a read still running.
    void (trackerPoller.active ? trackerPoller.focus() : refresh());
    void reconcileSessions();
  });
  if (process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void window.loadFile(join(import.meta.dirname, "../renderer/index.html"));
}

/** Stores what the user decided about a project's skill setup and reloads the views that depend on it. */
function changeCompat(projectPath: string, config: CompatConfig): void {
  store.update({ compat: { ...store.read().compat, [projectPath]: config } });
  void refresh();
}

/** Stores a settings change and sends the new settings to the window. */
function changeSettings(patch: Partial<UiState>): void {
  const saved = store.update(patch);
  ptyEnv[SESSION_RETENTION_ENV] = String(saved.sessionRetentionDays);
  sendSettings();
}

/** Shows what went wrong with sessions resumed from the menu or at start; nothing when all went well. */
function notifyWarnings(warnings: string[]): void {
  if (warnings.length > 0) sendToWindow("notice", warnings.join(" "));
}

/** A menu item that opens one of the window's dialogs. */
const menuCommand = (command: MenuCommand) => () => sendToWindow("menu:command", command);

function buildMenu(): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "File",
        submenu: [
          {
            label: "New Map...",
            accelerator: "CmdOrCtrl+Shift+M",
            enabled: project !== null,
            click: menuCommand("new-map"),
          },
          {
            label: "New Scratch Session...",
            enabled: project !== null,
            click: menuCommand("new-scratch"),
          },
          {
            label: "New Ticket...",
            accelerator: "CmdOrCtrl+N",
            enabled: project !== null,
            click: menuCommand("new-ticket"),
          },
          { label: "Open Project...", accelerator: "CmdOrCtrl+O", click: () => void pickProject().then(refresh) },
          { type: "separator" },
          { label: "Settings...", accelerator: "CmdOrCtrl+,", click: menuCommand("settings") },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      {
        label: "Sessions",
        submenu: [
          {
            label: "Resume All Paused Sessions",
            enabled: project !== null,
            click: () => void resumeAllPaused(null).then(({ warnings }) => notifyWarnings(warnings)),
          },
        ],
      },
      { label: "View", submenu: [{ role: "reload" }, { role: "toggleDevTools" }] },
      { label: "Help", submenu: [{ label: "About Dryland ADE", click: menuCommand("about") }] },
    ]),
  );
}

ipcMain.handle("state:get", currentState);
ipcMain.handle("project:open", async () => {
  await pickProject();
  return currentState();
});
ipcMain.handle("project:switch", async (_event, path: unknown) => {
  if (typeof path === "string" && store.read().openProjects.includes(path)) await openProject(path);
  return currentState();
});
ipcMain.handle("project:close", async (_event, path: unknown) => {
  if (typeof path === "string") await closeOpenProject(path);
  return currentState();
});
ipcMain.handle("projects:summaries", () => projectSummaries());
ipcMain.handle("tabs:save", (_event, tabs: TabsState) => {
  if (project === null) return;
  const saved = store.read().tabs;
  store.update({ tabs: { ...saved, [project.path]: parseTabs(tabs) } });
});
ipcMain.handle("sessions-layout:save", (_event, layout: unknown) => {
  if (project === null) return;
  const saved = store.read().sessionsLayout;
  store.update({ sessionsLayout: { ...saved, [project.path]: parseSessionsLayout(layout) } });
});
ipcMain.handle("tracker:widget-action", (_event, kind: unknown): Promise<string | null> =>
  runTrackerWidgetAction(kind, {
    runner: nodeProcessRunner,
    projectPath: project?.path ?? null,
    openPath: (path) => shell.openPath(path),
  }),
);
ipcMain.handle("item:read", (_event, ref: DocumentRef) => readItem(ref));
/** The Explorer reads the open project's worktrees; nothing without a project. */
const explorerFor = () => {
  if (project === null) throw new DrylandError("No project is open.", "opening a project");
  return createExplorer(nodeProcessRunner, project.path);
};
const explorerWatcher = createExplorerWatcher(() => sendToWindow("explorer:changed"));
const text = (value: unknown, what: string): string => {
  if (typeof value !== "string") throw new TypeError(`${what} must be a string`);
  return value;
};
ipcMain.handle("explorer:root", (_event, hint: unknown) => {
  if (!isRootHint(hint)) throw new TypeError("not a worktree hint");
  return explorerFor().resolveRoot(hint);
});
ipcMain.handle("explorer:list", (_event, root: unknown, dir: unknown) =>
  explorerFor().listDirectory(text(root, "root"), text(dir, "dir")),
);
ipcMain.handle("explorer:read", (_event, root: unknown, path: unknown) =>
  explorerFor().readFile(text(root, "root"), text(path, "path")),
);
ipcMain.handle("explorer:changes", (_event, root: unknown) => explorerFor().changes(text(root, "root")));
ipcMain.handle("explorer:diff", (_event, root: unknown, path: unknown) =>
  explorerFor().diff(text(root, "root"), text(path, "path")),
);
ipcMain.handle("explorer:watch", async (_event, root: unknown, dirs: unknown) => {
  if (!Array.isArray(dirs) || !dirs.every((dir) => typeof dir === "string")) {
    throw new TypeError("dirs must be strings");
  }
  // Refuses a root that is no worktree of the project and directories outside it.
  const gitDir = await explorerFor().watchTarget(text(root, "root"), dirs as string[]);
  explorerWatcher.set(root as string, dirs as string[], gitDir ?? undefined);
});
const sourceControlFor = () => {
  const explorer = explorerFor();
  return createSourceControl(nodeProcessRunner, project!.path, explorer, {
    attached: (path) => work.liveSessionIn(path) !== undefined,
    handToAgent: (path, text) => work.typeIntoSession(path, text),
    onPruned: async (path) => {
      const warning = await work.forgetWorktree(path);
      if (warning !== null) console.warn(warning);
      void refresh();
    },
  });
};
const paths = (value: unknown): string[] => {
  if (!Array.isArray(value) || !value.every((path) => typeof path === "string")) {
    throw new TypeError("paths must be strings");
  }
  return value as string[];
};
ipcMain.handle("source-control:status", (_event, root: unknown) => sourceControlFor().status(text(root, "root")));
ipcMain.handle("source-control:graph", (_event, root: unknown) => sourceControlFor().graph(text(root, "root")));
ipcMain.handle("source-control:unlinked", () => sourceControlFor().unlinked());
ipcMain.handle("source-control:stage", (_event, root: unknown, files: unknown) =>
  sourceControlFor().stage(text(root, "root"), paths(files)),
);
ipcMain.handle("source-control:unstage", (_event, root: unknown, files: unknown) =>
  sourceControlFor().unstage(text(root, "root"), paths(files)),
);
ipcMain.handle("source-control:commit", (_event, root: unknown, message: unknown) =>
  sourceControlFor().commit(text(root, "root"), text(message, "message")),
);
ipcMain.handle("source-control:merge-check", (_event, root: unknown) =>
  sourceControlFor().mergeCheck(text(root, "root")),
);
ipcMain.handle("source-control:merge", async (_event, root: unknown, strategy: unknown, cleanup: unknown) => {
  if (typeof strategy !== "string" || !(MERGE_STRATEGIES as readonly string[]).includes(strategy)) {
    throw new TypeError("not a merge strategy");
  }
  const result = await sourceControlFor().merge(text(root, "root"), strategy as MergeStrategy, cleanup === true);
  if (result.ok) void refresh();
  return result;
});
ipcMain.handle("source-control:pull-request", (_event, root: unknown) =>
  sourceControlFor().pullRequest(text(root, "root")),
);
ipcMain.handle("source-control:open-pull-request", async (_event, root: unknown) => {
  const result = await sourceControlFor().openRequest(text(root, "root"));
  if (result.ok) void refresh();
  return result;
});
ipcMain.handle("source-control:prune", (_event, root: unknown) => sourceControlFor().prune(text(root, "root")));
ipcMain.handle("source-control:hand-to-agent", (_event, root: unknown) =>
  sourceControlFor().handConflictsToAgent(text(root, "root")),
);
ipcMain.handle("legend:dismiss", () => void store.update({ legendDismissed: true }));
ipcMain.handle("live-events:mode", (_event, mode: unknown) => {
  if (isLiveEventsPanelMode(mode)) store.update({ liveEventsPanel: mode });
});
ipcMain.handle(
  "panel-widths:save",
  (_event, widths: unknown) => void store.update({ panelWidths: parsePanelWidths(widths) }),
);
ipcMain.handle("panel-folded:save", (_event, folded: unknown) => void store.update({ panelFolded: parsePanelFolded(folded) }));
ipcMain.handle("terminal:open", async () => {
  const loaded = await projectView();
  if (loaded === null) return null;
  const id = work.openShell(loaded.mainCheckout ?? loaded.view.path);
  shellProjects.set(id, loaded.view.path);
  return id;
});
ipcMain.handle("agents:list", () => work.listAgents());
ipcMain.handle("work:pending-user-config", (_event, agentId: unknown) =>
  typeof agentId === "string" ? work.pendingUserConfigWrite(agentId).catch(() => null) : null,
);
ipcMain.handle("skills:list", async (_event, agentId: unknown): Promise<string[]> => {
  if (project === null || typeof agentId !== "string") return [];
  try {
    return await work.listSkills(project.path, agentId);
  } catch (error) {
    if (!(error instanceof DrylandError)) throw error;
    return [];
  }
});
ipcMain.handle(
  "work:start",
  async (_event, target: unknown, agentId: unknown, skill: unknown): Promise<StartWorkResult> => {
    if (!isWorkTarget(target) || typeof agentId !== "string" || !isSkillChoice(skill))
      return { ok: false, message: "That is not something work can start on.", nextAction: "Retry from the app." };
    if (project === null) return { ok: false, message: "No project is open.", nextAction: "Open a project first." };
    try {
      const { session, warnings } = await work.startWork(project.path, target, agentId, skill);
      status.launched(session.id);
      sendSessionStates();
      // The session now holds its claim, which is no longer possibly stale.
      void refresh();
      return { ok: true, session, warnings };
    } catch (error) {
      if (!(error instanceof DrylandError)) throw error;
      return { ok: false, message: error.message, nextAction: error.nextAction };
    }
  },
);
ipcMain.handle("work:resume", async (_event, ticket: unknown, mode: unknown): Promise<StartWorkResult> => {
  if (!isTicketRef(ticket) || (mode !== "resume" && mode !== "pick"))
    return { ok: false, message: "That is not a session to resume.", nextAction: "Retry from the app." };
  if (project === null) return { ok: false, message: "No project is open.", nextAction: "Open a project first." };
  try {
    const { session, warnings } = await work.resumeSession(project.path, ticket, mode);
    status.launched(session.id);
    sendSessionStates();
    // The claim is held by a live session again, so it no longer reads as paused.
    void refresh();
    return { ok: true, session, warnings };
  } catch (error) {
    if (!(error instanceof DrylandError)) throw error;
    return { ok: false, message: error.message, nextAction: error.nextAction };
  }
});
ipcMain.handle("work:resume-all", (_event, map: unknown): Promise<ResumedAllResult> => {
  if (map !== null && typeof map !== "string") return Promise.resolve({ resumed: 0, warnings: ["That is not a map."] });
  return resumeAllPaused(map);
});
/** Accepting the deviations is stored against the deviation fingerprint, so the dialog stays away until the setup changes. */
ipcMain.handle("compat:accept", async (): Promise<void> => {
  if (project === null) return;
  const report = await readSkillSetup(await findMainCheckout(nodeProcessRunner, project.path));
  const saved = store.read().compat;
  changeCompat(project.path, {
    ...(saved[project.path] ?? NO_COMPAT_CONFIG),
    acceptedDeviations: report.deviationFingerprint,
  });
});
/** Forgets the accepted deviations: the dialog asks again for a setup without a valid verdict. */
ipcMain.handle("compat:revoke", (): void => {
  if (project === null) return;
  changeCompat(project.path, { ...compatConfig(project.path), acceptedDeviations: null });
});
ipcMain.handle("agent-hooks:read", (_event, agentId: unknown) =>
  typeof agentId === "string" ? agentHooks.read(agentId, project?.path ?? null) : null,
);
ipcMain.handle("agent-hooks:change", (_event, agentId: unknown, action: unknown) =>
  typeof agentId === "string" && isAgentHooksAction(action)
    ? agentHooks.change(agentId, project?.path ?? null, action)
    : null,
);
/** Turns a rule the verdict calls broken back on, or off again. */
ipcMain.handle("compat:override", (_event, ruleId: unknown, enabled: unknown): void => {
  if (project === null || typeof ruleId !== "string" || typeof enabled !== "boolean") return;
  const config = compatConfig(project.path);
  const others = config.overrides.filter((id) => id !== ruleId);
  changeCompat(project.path, { ...config, overrides: enabled ? [...others, ruleId] : others });
});
ipcMain.handle("tracker:run", async (_event, action: unknown, commit: unknown): Promise<TicketActionResult> => {
  if (!isTicketAction(action) || typeof commit !== "boolean")
    return { ok: false, message: "That is not a ticket action.", nextAction: "Retry from the ticket." };
  if (project === null) return { ok: false, message: "No project is open.", nextAction: "Open a project first." };
  // Commits as the renderer said, so a confirmation names exactly what runs; `dryland` finds the main checkout.
  const result = await dryland.run(trackerArgs(action, commit), { cwd: project.path });
  void refresh();
  return result;
});
ipcMain.handle("confirmations:dont-ask", (_event, type: unknown) => {
  if (!isConfirmationType(type)) return;
  changeSettings({ dontAsk: { ...store.read().dontAsk, [type]: true } });
});
ipcMain.handle("updates:state", () => updater.state());
ipcMain.handle("updates:check", () => updater.checkNow());
ipcMain.handle("updates:channel", (_event, channel: unknown) => {
  if (isUpdateChannel(channel)) return updater.setChannel(channel);
});
ipcMain.handle("updates:open-release", async () => {
  const { status } = updater.state();
  if (status.kind === "available") await shell.openExternal(status.url);
});
ipcMain.handle("settings:change", (_event, change: unknown) => {
  if (!isSettingsChange(change)) return;
  changeSettings(settingsPatch(store.read(), change, project?.path ?? null));
});
ipcMain.on("terminal:write", (_event, id: string, data: string) => {
  work.userTyped(id, data);
  terminals.write(id, data);
});
ipcMain.on("terminal:resize", (_event, id: string, cols: number, rows: number) => terminals.resize(id, cols, rows));
ipcMain.on("terminal:close", (_event, id: string) => {
  // Closing a session's tab hides the session: its CLI keeps running until the session is stopped.
  // A session started by hand is its terminal's shell: that ends with the tab.
  const session = sessionIn(id);
  if (session !== undefined && session.manual !== true) return;
  terminals.close(id);
  if (session !== undefined) terminalEnded(id);
});
ipcMain.on("terminal:view", (_event, id: unknown) => {
  const session = typeof id === "string" ? sessionIn(id) : undefined;
  if (unseen.view(session?.id ?? null)) sendUnseen();
});
ipcMain.handle("terminal:replay", (_event, id: unknown) => (typeof id === "string" ? terminals.output(id) : null));
ipcMain.handle("session:stop", (_event, sessionId: unknown) => {
  const session = work.sessions().find((s) => s.id === sessionId);
  if (session === undefined) return;
  // Only the process ends: the claim stays, and the session index keeps the last state the hooks reported, so the
  // session reads as paused (ADR 0010). The manager reports no exit for a terminal it closes.
  terminals.close(session.terminalId);
  terminalEnded(session.terminalId);
});

// One app per user: a second launch brings the running app's window to the front and quits, so it never takes over
// the live-reporting lock file or starts sessions of its own.
const primary = app.requestSingleInstanceLock();
if (!primary) app.quit();
app.on("second-instance", () => {
  if (window === null) return;
  if (window.isMinimized()) window.restore();
  window.focus();
});

void app.whenReady().then(async () => {
  if (!primary) return;
  // An installed app ships its launcher; one an earlier version wrote here would shadow it.
  if (!layout.writeLauncher) removeStaleLauncher(shimDir);
  writeLauncher(
    shimDir,
    { runtime: process.execPath, cli: layout.cli },
    // The shim adds only the status-hooks flag; a CLI with launch arguments of its own needs a richer one.
    // Only CLIs with status hooks get one: a shim for a hookless CLI would report nothing.
    AGENT_ADAPTERS.filter((a) => a.launchArgs.length === 0 && hasStatusHooks(a)).map(({ id, binary }) => ({
      id,
      binary,
    })),
    { launcher: layout.writeLauncher },
  );
  ptyEnv[SESSION_RETENTION_ENV] = String(store.read().sessionRetentionDays);
  // Listening before any terminal opens, so every session can report; a new port and token on every launch.
  try {
    live = await startLiveListener({ lockFile: liveLockFile(process.env), onEvent: onLiveEvent });
    ptyEnv["DRYLAND_PORT"] = String(live.port);
    ptyEnv["DRYLAND_TOKEN"] = live.token;
  } catch (error) {
    // Without the listener the app still works; it only misses live events until the next launch.
    console.error("Live reporting is off: could not start the listener.", error);
  }
  // The window opens first; a slow or missing last project fills in when it has loaded.
  buildMenu();
  createWindow();
  void updater.automatic();
  setInterval(() => void updater.automatic(), UPDATE_TICK_MS).unref();
  const { lastProject } = store.read();
  // The window shows the project last shown; the other open projects load when the user switches to them.
  if (lastProject !== null) {
    await openProject(lastProject);
    await reconcileSessions();
    await refresh();
    if (store.read().resumeOnStart) void resumeAllPaused(null).then(({ warnings }) => notifyWarnings(warnings));
  }
});

/** Whether quitting may go ahead: it asks first while sessions run, and stops them once allowed. */
let quit: "ask" | "asking" | "allowed" = "ask";

/** The sessions whose Agent CLI still runs, tab or not. */
const runningSessions = () => {
  const live = new Set(terminals.liveIds());
  return work.sessions().filter((session) => live.has(session.terminalId));
};

/**
 * Stops everything: no process outlives the app (ADR 0002). Nothing is released and no tracker is written; claims
 * stay and the sessions become paused (ADR 0010). UI state is written as it changes, so none is pending here;
 * session index writes may be, and are flushed. An OS-forced shutdown has the 2-second budget; a user quit has none,
 * reports its steps to the window, and can be abandoned.
 */
async function stopEverything(budgetMs: number | null, hooks: ShutdownHooks = {}): Promise<void> {
  stopWatching?.();
  stopWatching = null;
  explorerWatcher.stop();
  // Lets the e2e tests hold a quit open long enough to press "Quit now"; never set in use.
  const slowMs = Number(process.env.DRYLAND_TEST_SLOW_SHUTDOWN_MS);
  const slow: ShutdownStep[] =
    slowMs > 0 ? [{ name: "test delay", run: () => new Promise((r) => setTimeout(r, slowMs)) }] : [];
  const report = await runShutdown(
    shutdownSteps(terminals, [{ name: "flush session index", run: recorder.flush }, ...slow]),
    budgetMs,
    hooks,
  );
  if (report.failed.length > 0 || report.abandoned.length > 0) console.error("Shutdown was cut short.", report);
}

/** System shutdown, or a quit with nothing running: no question asked, only the stop. */
async function shutDown(budgetMs: number | null = SHUTDOWN_BUDGET_MS): Promise<void> {
  quit = "allowed";
  await stopEverything(budgetMs);
  app.quit();
}

/** Whether the window shows the quit question right now. */
let askedInWindow = false;

/** Stopped by the quit dialog's "Quit now": the remaining steps are dropped. */
let abandonQuit: AbortController | null = null;

/** The quit dialog confirmed: stop with no deadline, telling the window each step's progress, then quit. */
async function quitFromDialog(): Promise<void> {
  quit = "allowed";
  abandonQuit = new AbortController();
  const abandon = abandonQuit.signal;
  await stopEverything(null, { abandon, onStep: (step, state) => sendToWindow("quit:progress", { step, state }) });
  abandonQuit = null;
  app.quit();
}

/** Resolves when the window says it shows the quit dialog; `stop` stops listening. */
function windowShowsQuitDialog(): { shown: Promise<void>; stop: () => void } {
  let stop = () => {};
  const shown = new Promise<void>((resolve) => {
    const listener = () => resolve();
    ipcMain.once("quit:shown", listener);
    stop = () => void ipcMain.removeListener("quit:shown", listener);
  });
  return { shown, stop };
}

/** The native message box, for a window that does not answer; on Quit, stops them and quits. */
async function askNatively(listing: QuitListing[]): Promise<void> {
  const confirmation = quitConfirmation(listing);
  if (confirmation !== null) {
    const options = { type: "question" as const, ...confirmation, defaultId: 1, cancelId: 1, noLink: true };
    const { response } = await (window === null
      ? dialog.showMessageBox(options)
      : dialog.showMessageBox(window, options));
    if (response !== 0) {
      quit = "ask";
      return;
    }
  }
  await shutDown(null);
}

/** Asks before quitting while sessions run: in the window, or natively when the window does not answer. */
async function confirmQuit(): Promise<void> {
  quit = "asking";
  const listing = quitListing(runningSessions(), status.states(), new Set(unseen.ids()));
  if (listing.length === 0) return void (await shutDown());
  if (window !== null && !window.isDestroyed()) {
    const { shown, stop } = windowShowsQuitDialog();
    sendToWindow("quit:request", { sessions: listing } satisfies QuitRequest);
    if ((await whoAsks(shown)) === "in-app") return void (askedInWindow = true);
    stop();
  }
  await askNatively(listing);
}

ipcMain.handle("quit:answer", async (_event, answer: unknown) => {
  if (!isQuitAnswer(answer)) return;
  if (answer !== "now") askedInWindow = false;
  if (answer === "cancel" && quit === "asking") quit = "ask";
  else if (answer === "confirm" && quit === "asking") await quitFromDialog();
  else if (answer === "now") abandonQuit?.abort();
});

app.on("before-quit", (event) => {
  if (quit === "allowed") return;
  event.preventDefault();
  if (quit === "ask") void confirmQuit();
});

// macOS and Linux announce a system shutdown here; Windows through the window's "session-end". The listener gets
// an event whose `preventDefault()` delays the shutdown, as Electron documents, though its types leave it out.
const onSystemShutdown = (event: Electron.Event) => {
  event.preventDefault();
  void shutDown();
};
void app.whenReady().then(() => powerMonitor.on("shutdown", onSystemShutdown as unknown as () => void));

app.on("window-all-closed", () => app.quit());

app.on("will-quit", () => {
  // Already done unless the window never opened; killing is safe twice.
  terminals.closeAll();
  // Removes the lock file at once, so `dryland` stops trying to reach this app.
  void live?.close();
});
