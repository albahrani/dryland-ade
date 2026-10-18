import { basename, join } from "node:path";
import {
  AGENT_ADAPTERS,
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
  readSessionIndex,
  resumeArgs,
  sessionsOf,
  readTicketDetail,
  reconcileSessionIndex,
  startLiveListener,
} from "@dryland/core";
import { app, BrowserWindow, dialog, ipcMain, Menu, type MenuItemConstructorOptions, powerMonitor } from "electron";
import {
  type AppSettings,
  type AppState,
  isLiveEventsPanelMode,
  type ItemContent,
  type MenuCommand,
  type ProjectView,
  type ResumedAllResult,
  type StartWorkResult,
  type TicketActionResult,
  type TreeLoad,
} from "../shared/api.ts";
import { DEFAULT_SESSIONS_LAYOUT, parseSessionsLayout } from "../shared/sessions-view.ts";
import { type DocumentRef, EMPTY_TABS, parseTabs, type TabsState, ticketKey } from "../shared/tabs.ts";
import {
  ASK_ALWAYS,
  autoCommitFor,
  isConfirmationType,
  isTicketAction,
  isTicketRef,
  trackerArgs,
} from "../shared/tracker-actions.ts";
import { createDrylandCli } from "./dryland-cli.ts";
import { latestOnly } from "./latest-only.ts";
import { writeLauncher } from "./launcher.ts";
import { quitConfirmation, runShutdown, shutdownSteps } from "./lifecycle.ts";
import { nodePtyProvider } from "./pty/node-pty-provider.ts";
import { createTerminalManager } from "./terminals.ts";
import { resolveShell } from "./shell.ts";
import { pausedTickets } from "../shared/paused-session.ts";
import { resumeAll } from "./resume-all.ts";
import { createSessionRecorder } from "./session-recording.ts";
import { createSessionStatus } from "./session-status.ts";
import { createUiStateStore, type UiState } from "./ui-state.ts";
import { createUnseenOutput } from "./unseen-output.ts";
import { STOP_CONFIRMATION_LABELS, STOP_CONFIRMATIONS } from "../shared/stop-session.ts";
import { watchProject } from "./watch-project.ts";
import { createWorkStarter } from "./work.ts";
import { isSkillChoice, isWorkTarget } from "../shared/work-target.ts";

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
    if (session !== undefined && unseen.output(session.id)) sendUnseen();
  },
  onExit: (id, exitCode) => {
    sendToWindow("terminal:exit", id, exitCode);
    terminalEnded(id);
  },
});
const store = createUiStateStore(join(app.getPath("userData"), "ui-state.json"));
// Sessions find `dryland` here; ticket 57 moves the launcher to the install directory.
const launcherDir = join(app.getPath("userData"), "bin");
// Every tracker write the app makes runs this, the same CLI sessions and the user run (ADR 0003).
const dryland = createDrylandCli({
  runtime: process.execPath,
  cli: join(import.meta.dirname, "dryland.js"),
  env: ptyEnv,
});
const autoCommit = (projectPath: string) => autoCommitFor(store.read(), projectPath);
const work = createWorkStarter({
  terminals,
  runner: nodeProcessRunner,
  env: ptyEnv,
  launcherDir,
  hooksDir: join(app.getPath("userData"), "hooks"),
  dryland,
  autoCommit,
});
let window: BrowserWindow | null = null;
let project: { path: string } | null = null;
let stopWatching: (() => void) | null = null;
let live: LiveListener | null = null;

const status = createSessionStatus();
// The session index is a cache: a write that fails is logged, never shown as an error.
const recorder = createSessionRecorder({
  runner: nodeProcessRunner,
  sessions: () => work.sessions(),
  warn: (message) => console.warn(message),
});
const sendSessionStates = () => sendToWindow("sessions:states", status.states());
const unseen = createUnseenOutput();
const sendUnseen = () => sendToWindow("sessions:unseen", unseen.ids());

/** The session running in terminal `id`, if one does. */
const sessionIn = (id: string) => work.sessions().find((s) => s.terminalId === id);

function settings(): AppSettings {
  const saved = store.read();
  return {
    autoCommit: project === null ? saved.autoCommit : autoCommitFor(saved, project.path),
    dontAsk: saved.dontAsk,
    stopConfirmation: saved.stopConfirmation,
    resumeOnStart: saved.resumeOnStart,
  };
}
const sendSettings = () => sendToWindow("settings:changed", settings());

/** The sessions this app started, as the next-step rules read them: a waiting one ranks first, and one that is gone
 * leaves its claim possibly stale. */
function liveSessions(): SessionSnapshot[] {
  const states = status.states();
  return work.sessions().map(({ id, ticket }) => ({ id, ticket, state: states[id] ?? "launched" }));
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
  status.exited(session.id);
  sendSessionStates();
  if (unseen.forget(session.id)) sendUnseen();
  // Its commits landed in a worktree the file watcher does not see; the git-fed next steps may have moved.
  void refresh();
}

/** Shows every live event; a ticket change also re-reads the tree, even where the file watcher missed it. */
function onLiveEvent(event: LiveEvent): void {
  sendToWindow("live:event", event);
  recorder.apply(event);
  const stateChanged = status.apply(event);
  if (stateChanged) sendSessionStates();
  // A session's state moves the next steps too: a waiting one ranks first.
  if (stateChanged || event.kind === "ticket.changed") void refresh();
}

async function loadTree(path: string): Promise<{ tree: TreeLoad; mainCheckout: string | null }> {
  try {
    const mainCheckout = await findMainCheckout(nodeProcessRunner, path);
    // One pass over the tracker files feeds both the tree and the rule engine, so markers and rows never disagree.
    const { tree, snapshot } = await readProjectState(nodeProcessRunner, mainCheckout, liveSessions());
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
    return { tree: { ok: true, tree, nextUp, staleClaims, pausedClaims }, mainCheckout };
  } catch (error) {
    if (!(error instanceof DrylandError)) throw error;
    return { tree: { ok: false, message: error.message, nextAction: error.nextAction }, mainCheckout: null };
  }
}

async function projectView(): Promise<{ view: ProjectView; mainCheckout: string | null } | null> {
  if (project === null) return null;
  const { tree, mainCheckout } = await loadTree(project.path);
  return { view: { path: project.path, name: basename(project.path), tree }, mainCheckout };
}

async function currentState(): Promise<AppState> {
  const { legendDismissed, tabs, sessionsLayout, liveEventsPanel } = store.read();
  const view = (await projectView())?.view ?? null;
  return {
    project: view,
    legendDismissed,
    liveEventsPanel,
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
  project = { path };
  const loaded = await projectView();
  if (loaded?.view.tree.ok) store.update({ lastProject: path });
  if (loaded?.mainCheckout) stopWatching = watchProject(loaded.mainCheckout, () => void refresh());
  // The project's auto-commit override shows in the menu and decides its writes.
  buildMenu();
  sendSettings();
}

let reconciling = false;

/**
 * Brings the session index in line with the tracker, git and Claude Code's history, in this process and never the
 * renderer. One run at a time; the window re-reads the project only when the index changed. The index is a cache, so
 * a failure is logged, never shown.
 */
async function reconcileSessions(): Promise<void> {
  if (project === null || reconciling) return;
  reconciling = true;
  try {
    const { changed, warnings } = await reconcileSessionIndex(nodeProcessRunner, project.path);
    warnings.forEach((message) => console.warn(message));
    if (changed) void refresh();
  } catch (error) {
    if (!(error instanceof DrylandError)) console.warn("The session index was not reconciled.", error);
  } finally {
    reconciling = false;
  }
}

/** Re-reads the project and sends it to the window; a read overtaken by a newer one is dropped, not sent late. */
const refresh = latestOnly(projectView, (loaded) => {
  if (loaded !== null) sendToWindow("project:changed", loaded.view);
});

async function pickProject(): Promise<void> {
  if (window === null) return;
  const result = await dialog.showOpenDialog(window, { title: "Open project", properties: ["openDirectory"] });
  const [path] = result.filePaths;
  if (result.canceled || path === undefined) return;
  // Terminals belong to the project they were opened in.
  if (path !== project?.path) {
    // The manager reports no exit for terminals it closes, so their sessions are ended here.
    const closing = terminals.liveIds();
    terminals.closeAll();
    closing.forEach(terminalEnded);
  }
  await openProject(path);
}

function createWindow(): void {
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
  // Git state behind the next steps changes outside the watched tracker files, e.g. a commit made in a terminal.
  window.on("focus", () => {
    void refresh();
    void reconcileSessions();
  });
  if (process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void window.loadFile(join(import.meta.dirname, "../renderer/index.html"));
}

/** Applies a settings change made from the menu: stored, shown in the menu, and sent to the window. */
function changeSettings(patch: Partial<UiState>): void {
  store.update(patch);
  buildMenu();
  sendSettings();
}

/** Auto-commit, globally and for the open project, and the reset of the write confirmations, until Settings has them. */
function trackerMenu(): MenuItemConstructorOptions[] {
  const saved = store.read();
  const path = project?.path;
  const override = path === undefined ? undefined : saved.projectAutoCommit[path];
  const setOverride = (value: boolean | undefined) => {
    if (path === undefined) return;
    const overrides = { ...store.read().projectAutoCommit };
    if (value === undefined) delete overrides[path];
    else overrides[path] = value;
    changeSettings({ projectAutoCommit: overrides });
  };
  return [
    {
      label: "Auto-commit Tracker Writes",
      type: "checkbox",
      checked: saved.autoCommit,
      click: () => changeSettings({ autoCommit: !store.read().autoCommit }),
    },
    {
      label: "Auto-commit in This Project",
      enabled: path !== undefined,
      submenu: [
        {
          label: "Use the Global Setting",
          type: "radio",
          checked: override === undefined,
          click: () => setOverride(undefined),
        },
        { label: "On", type: "radio", checked: override === true, click: () => setOverride(true) },
        { label: "Off", type: "radio", checked: override === false, click: () => setOverride(false) },
      ],
    },
    { type: "separator" },
    { label: "Reset Write Confirmations", click: () => changeSettings({ dontAsk: ASK_ALWAYS }) },
  ];
}

/** Shows what went wrong with sessions resumed from the menu or at start; nothing when all went well. */
function notifyWarnings(warnings: string[]): void {
  if (warnings.length > 0) sendToWindow("notice", warnings.join(" "));
}

/** Resume all and when stopping a session asks first, until Settings has them. */
function sessionsMenu(): MenuItemConstructorOptions[] {
  const { stopConfirmation: current, resumeOnStart } = store.read();
  return [
    {
      label: "Resume All Paused Sessions",
      enabled: project !== null,
      click: () => void resumeAllPaused(null).then(({ warnings }) => notifyWarnings(warnings)),
    },
    {
      label: "Resume Sessions on Start",
      type: "checkbox",
      checked: resumeOnStart,
      click: () => changeSettings({ resumeOnStart: !store.read().resumeOnStart }),
    },
    { type: "separator" },
    {
      label: "Ask Before Stopping a Session",
      submenu: STOP_CONFIRMATIONS.map((rule) => ({
        label: STOP_CONFIRMATION_LABELS[rule],
        type: "radio" as const,
        checked: current === rule,
        click: () => changeSettings({ stopConfirmation: rule }),
      })),
    },
  ];
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
            label: "New Ticket...",
            accelerator: "CmdOrCtrl+N",
            enabled: project !== null,
            click: menuCommand("new-ticket"),
          },
          { label: "Open Project...", accelerator: "CmdOrCtrl+O", click: () => void pickProject().then(refresh) },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      { label: "Tracker", submenu: trackerMenu() },
      { label: "Sessions", submenu: sessionsMenu() },
      { label: "View", submenu: [{ role: "reload" }, { role: "toggleDevTools" }] },
    ]),
  );
}

ipcMain.handle("state:get", currentState);
ipcMain.handle("project:open", async () => {
  await pickProject();
  return currentState();
});
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
ipcMain.handle("item:read", (_event, ref: DocumentRef) => readItem(ref));
ipcMain.handle("legend:dismiss", () => void store.update({ legendDismissed: true }));
ipcMain.handle("live-events:mode", (_event, mode: unknown) => {
  if (isLiveEventsPanelMode(mode)) store.update({ liveEventsPanel: mode });
});
ipcMain.handle("terminal:open", async () => {
  const loaded = await projectView();
  if (loaded === null) return null;
  return terminals.open({ cwd: loaded.mainCheckout ?? loaded.view.path });
});
ipcMain.handle("agents:list", () => work.listAgents());
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
ipcMain.on("terminal:write", (_event, id: string, data: string) => terminals.write(id, data));
ipcMain.on("terminal:resize", (_event, id: string, cols: number, rows: number) => terminals.resize(id, cols, rows));
ipcMain.on("terminal:close", (_event, id: string) => {
  // Closing a session's tab hides the session: its CLI keeps running until the session is stopped.
  if (sessionIn(id) !== undefined) return;
  terminals.close(id);
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
  // The CLI bundle is built next to this file; the launcher runs it with this very Electron binary.
  writeLauncher(launcherDir, { runtime: process.execPath, cli: join(import.meta.dirname, "dryland.js") });
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
  const { lastProject } = store.read();
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
 * Stops everything within the shutdown budget: no process outlives the app (ADR 0002). Nothing is released and no
 * tracker is written; claims stay and the sessions become paused (ADR 0010). UI state is written as it changes, so
 * none is pending here; session index writes may be, and are flushed.
 */
async function stopEverything(): Promise<void> {
  stopWatching?.();
  stopWatching = null;
  const report = await runShutdown(shutdownSteps(terminals, [{ name: "flush session index", run: recorder.flush }]));
  if (report.failed.length > 0 || report.abandoned.length > 0) console.error("Shutdown was cut short.", report);
}

/** System shutdown: no question asked, only the budgeted stop. */
async function shutDown(): Promise<void> {
  quit = "allowed";
  await stopEverything();
  app.quit();
}

/** Asks before quitting while sessions run; on Quit, stops them and quits. */
async function confirmQuit(): Promise<void> {
  quit = "asking";
  const confirmation = quitConfirmation(runningSessions(), status.states(), new Set(unseen.ids()));
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
  await shutDown();
}

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
