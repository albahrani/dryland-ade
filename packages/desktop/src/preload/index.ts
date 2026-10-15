import { contextBridge, ipcRenderer } from "electron";
import type { DrylandApi, ProjectView } from "../shared/api.ts";

const api: DrylandApi = {
  getState: () => ipcRenderer.invoke("state:get"),
  openProject: () => ipcRenderer.invoke("project:open"),
  dismissLegend: () => ipcRenderer.invoke("legend:dismiss"),
  saveTabs: (tabs) => ipcRenderer.invoke("tabs:save", tabs),
  readItem: (ref) => ipcRenderer.invoke("item:read", ref),
  openTerminal: () => ipcRenderer.invoke("terminal:open"),
  listAgents: () => ipcRenderer.invoke("agents:list"),
  startWork: (ticket, agentId) => ipcRenderer.invoke("work:start", ticket, agentId),
  writeTerminal: (id, data) => ipcRenderer.send("terminal:write", id, data),
  resizeTerminal: (id, cols, rows) => ipcRenderer.send("terminal:resize", id, cols, rows),
  closeTerminal: (id) => ipcRenderer.send("terminal:close", id),
  onTerminalData(callback) {
    const listener = (_event: unknown, id: string, data: string) => callback(id, data);
    ipcRenderer.on("terminal:data", listener);
    return () => ipcRenderer.removeListener("terminal:data", listener);
  },
  onTerminalExit(callback) {
    const listener = (_event: unknown, id: string, exitCode: number) => callback(id, exitCode);
    ipcRenderer.on("terminal:exit", listener);
    return () => ipcRenderer.removeListener("terminal:exit", listener);
  },
  onProjectChanged(callback) {
    const listener = (_event: unknown, project: ProjectView) => callback(project);
    ipcRenderer.on("project:changed", listener);
    return () => ipcRenderer.removeListener("project:changed", listener);
  },
};

contextBridge.exposeInMainWorld("dryland", api);
