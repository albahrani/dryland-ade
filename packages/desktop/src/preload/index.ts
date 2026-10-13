import { contextBridge, ipcRenderer } from "electron";
import type { DrylandApi, ProjectView } from "../shared/api.ts";

const api: DrylandApi = {
  getState: () => ipcRenderer.invoke("state:get"),
  openProject: () => ipcRenderer.invoke("project:open"),
  dismissLegend: () => ipcRenderer.invoke("legend:dismiss"),
  saveTabs: (tabs) => ipcRenderer.invoke("tabs:save", tabs),
  readItem: (ref) => ipcRenderer.invoke("item:read", ref),
  onProjectChanged(callback) {
    const listener = (_event: unknown, project: ProjectView) => callback(project);
    ipcRenderer.on("project:changed", listener);
    return () => ipcRenderer.removeListener("project:changed", listener);
  },
};

contextBridge.exposeInMainWorld("dryland", api);
