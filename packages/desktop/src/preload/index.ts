import type { LiveEvent, SessionState } from "@dryland/core";
import { contextBridge, ipcRenderer } from "electron";
import type { AppSettings, DrylandApi, ProjectView } from "../shared/api.ts";

const api: DrylandApi = {
  getState: () => ipcRenderer.invoke("state:get"),
  openProject: () => ipcRenderer.invoke("project:open"),
  dismissLegend: () => ipcRenderer.invoke("legend:dismiss"),
  setLiveEventsPanel: (mode) => ipcRenderer.invoke("live-events:mode", mode),
  saveTabs: (tabs) => ipcRenderer.invoke("tabs:save", tabs),
  readItem: (ref) => ipcRenderer.invoke("item:read", ref),
  openTerminal: () => ipcRenderer.invoke("terminal:open"),
  listAgents: () => ipcRenderer.invoke("agents:list"),
  startWork: (ticket, agentId) => ipcRenderer.invoke("work:start", ticket, agentId),
  runTicketAction: (action, commit) => ipcRenderer.invoke("tracker:run", action, commit),
  dontAskAgain: (type) => ipcRenderer.invoke("confirmations:dont-ask", type),
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
  onLiveEvent(callback) {
    const listener = (_event: unknown, event: LiveEvent) => callback(event);
    ipcRenderer.on("live:event", listener);
    return () => ipcRenderer.removeListener("live:event", listener);
  },
  onSettingsChanged(callback) {
    const listener = (_event: unknown, settings: AppSettings) => callback(settings);
    ipcRenderer.on("settings:changed", listener);
    return () => ipcRenderer.removeListener("settings:changed", listener);
  },
  onSessionStates(callback) {
    const listener = (_event: unknown, states: Readonly<Record<string, SessionState>>) => callback(states);
    ipcRenderer.on("sessions:states", listener);
    return () => ipcRenderer.removeListener("sessions:states", listener);
  },
};

contextBridge.exposeInMainWorld("dryland", api);
