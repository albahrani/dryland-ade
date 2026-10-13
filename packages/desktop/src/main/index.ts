import { basename, join } from "node:path";
import { DrylandError, findMainCheckout, nodeProcessRunner, readTicketsTree } from "@dryland/core";
import { app, BrowserWindow, dialog, ipcMain, Menu } from "electron";
import type { AppState, ProjectView, TreeLoad } from "../shared/api.ts";
import { createUiStateStore } from "./ui-state.ts";
import { watchProject } from "./watch-project.ts";

const store = createUiStateStore(join(app.getPath("userData"), "ui-state.json"));
let window: BrowserWindow | null = null;
let project: { path: string } | null = null;
let stopWatching: (() => void) | null = null;

async function loadTree(path: string): Promise<{ tree: TreeLoad; mainCheckout: string | null }> {
  try {
    const mainCheckout = await findMainCheckout(nodeProcessRunner, path);
    return { tree: { ok: true, tree: await readTicketsTree(mainCheckout) }, mainCheckout };
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
  return { project: (await projectView())?.view ?? null, legendDismissed: store.read().legendDismissed };
}

/** Makes `path` the open project and starts watching its tracker files. Remembers it only if it loads. */
async function openProject(path: string): Promise<void> {
  stopWatching?.();
  stopWatching = null;
  project = { path };
  const loaded = await projectView();
  if (loaded?.view.tree.ok) store.update({ lastProject: path });
  if (loaded?.mainCheckout) stopWatching = watchProject(loaded.mainCheckout, () => void refresh());
}

async function refresh(): Promise<void> {
  const loaded = await projectView();
  if (loaded !== null) window?.webContents.send("project:changed", loaded.view);
}

async function pickProject(): Promise<void> {
  if (window === null) return;
  const result = await dialog.showOpenDialog(window, { title: "Open project", properties: ["openDirectory"] });
  const [path] = result.filePaths;
  if (!result.canceled && path !== undefined) await openProject(path);
}

function createWindow(): void {
  window = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "Dryland ADE",
    webPreferences: { preload: join(import.meta.dirname, "../preload/index.cjs"), sandbox: true },
  });
  window.on("closed", () => (window = null));
  if (process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void window.loadFile(join(import.meta.dirname, "../renderer/index.html"));
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
      { label: "View", submenu: [{ role: "reload" }, { role: "toggleDevTools" }] },
    ]),
  );
}

ipcMain.handle("state:get", currentState);
ipcMain.handle("project:open", async () => {
  await pickProject();
  return currentState();
});
ipcMain.handle("legend:dismiss", () => void store.update({ legendDismissed: true }));

void app.whenReady().then(async () => {
  const { lastProject } = store.read();
  if (lastProject !== null) await openProject(lastProject);
  buildMenu();
  createWindow();
});

app.on("window-all-closed", () => {
  stopWatching?.();
  app.quit();
});
