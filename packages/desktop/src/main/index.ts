import { basename, join } from "node:path";
import {
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
  readTicketDetail,
  startLiveListener,
  type TicketRef,
} from "@dryland/core";
import { app, BrowserWindow, dialog, ipcMain, Menu, type MenuItemConstructorOptions } from "electron";
import {
  type AppSettings,
  type AppState,
  isLiveEventsPanelMode,
  type ItemContent,
  type ProjectView,
  type StartWorkResult,
  type TicketActionResult,
  type TreeLoad,
} from "../shared/api.ts";
import { type DocumentRef, EMPTY_TABS, parseTabs, type TabsState } from "../shared/tabs.ts";
import {
  ASK_ALWAYS,
  autoCommitFor,
  isConfirmationType,
  isTicketAction,
  trackerArgs,
} from "../shared/tracker-actions.ts";
import { createDrylandCli } from "./dryland-cli.ts";
import { latestOnly } from "./latest-only.ts";
import { writeLauncher } from "./launcher.ts";
import { nodePtyProvider } from "./pty/node-pty-provider.ts";
import { createTerminalManager } from "./terminals.ts";
import { resolveShell } from "./shell.ts";
import { createSessionStatus } from "./session-status.ts";
import { createUiStateStore, type UiState } from "./ui-state.ts";
import { watchProject } from "./watch-project.ts";
import { createWorkStarter } from "./work.ts";

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
  onData: (id, data) => sendToWindow("terminal:data", id, data),
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
const sendSessionStates = () => sendToWindow("sessions:states", status.states());

function settings(): AppSettings {
  const saved = store.read();
  return {
    autoCommit: project === null ? saved.autoCommit : autoCommitFor(saved, project.path),
    dontAsk: saved.dontAsk,
  };
}
const sendSettings = () => sendToWindow("settings:changed", settings());

/** The sessions this app started, as the next-step rules read them: a waiting one ranks first, and one that is gone
 * leaves its claim possibly stale. */
function liveSessions(): SessionSnapshot[] {
  const states = status.states();
  return work.sessions().map(({ id, ticket }) => ({ id, ticket, state: states[id] ?? "launched" }));
}

/** Ends the session in terminal `id`, if one runs there: its CLI exited, or Dryland closed the terminal. */
function terminalEnded(id: string): void {
  const session = work.sessions().find((s) => s.terminalId === id);
  if (session === undefined) return;
  status.exited(session.id);
  sendSessionStates();
  // Its commits landed in a worktree the file watcher does not see; the git-fed next steps may have moved.
  void refresh();
}

/** Shows every live event; a ticket change also re-reads the tree, even where the file watcher missed it. */
function onLiveEvent(event: LiveEvent): void {
  sendToWindow("live:event", event);
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
      ruleId === "stale-claim" && target.kind === "ticket" ? [`${target.map}/${target.id}`] : [],
    );
    return { tree: { ok: true, tree, nextUp, staleClaims }, mainCheckout };
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
  const { legendDismissed, tabs, liveEventsPanel } = store.read();
  const view = (await projectView())?.view ?? null;
  return {
    project: view,
    legendDismissed,
    liveEventsPanel,
    tabs: (view && tabs[view.path]) || EMPTY_TABS,
    sessions: work.sessions(),
    sessionStates: status.states(),
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
  window.on("closed", () => (window = null));
  // Git state behind the next steps changes outside the watched tracker files, e.g. a commit made in a terminal.
  window.on("focus", () => void refresh());
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

function buildMenu(): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "File",
        submenu: [
          { label: "Open Project...", accelerator: "CmdOrCtrl+O", click: () => void pickProject().then(refresh) },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      { label: "Tracker", submenu: trackerMenu() },
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
ipcMain.handle("work:start", async (_event, ticket: TicketRef, agentId: string): Promise<StartWorkResult> => {
  if (project === null) return { ok: false, message: "No project is open.", nextAction: "Open a project first." };
  try {
    const { session, warnings } = await work.startWork(project.path, ticket, agentId);
    status.launched(session.id);
    sendSessionStates();
    // The session now holds its claim, which is no longer possibly stale.
    void refresh();
    return { ok: true, session, warnings };
  } catch (error) {
    if (!(error instanceof DrylandError)) throw error;
    return { ok: false, message: error.message, nextAction: error.nextAction };
  }
});
ipcMain.handle("tracker:run", async (_event, action: unknown): Promise<TicketActionResult> => {
  if (!isTicketAction(action))
    return { ok: false, message: "That is not a ticket action.", nextAction: "Retry from the ticket." };
  if (project === null) return { ok: false, message: "No project is open.", nextAction: "Open a project first." };
  // `dryland` finds the main checkout from the project itself.
  const result = await dryland.run(trackerArgs(action, autoCommit(project.path)), { cwd: project.path });
  void refresh();
  return result;
});
ipcMain.handle("confirmations:dont-ask", (_event, type: unknown) => {
  if (!isConfirmationType(type)) return;
  store.update({ dontAsk: { ...store.read().dontAsk, [type]: true } });
  sendSettings();
});
ipcMain.on("terminal:write", (_event, id: string, data: string) => terminals.write(id, data));
ipcMain.on("terminal:resize", (_event, id: string, cols: number, rows: number) => terminals.resize(id, cols, rows));
ipcMain.on("terminal:close", (_event, id: string) => {
  terminals.close(id);
  terminalEnded(id);
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
    await refresh();
  }
});

app.on("window-all-closed", () => {
  stopWatching?.();
  app.quit();
});

// No process outlives the app (ADR 0002).
app.on("will-quit", () => {
  terminals.closeAll();
  // Removes the lock file at once, so `dryland` stops trying to reach this app.
  void live?.close();
});
