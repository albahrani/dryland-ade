import type { LiveEvent, SessionState } from "@dryland/core";
import { contextBridge, ipcRenderer } from "electron";
import type { AppSettings, DrylandApi, MenuCommand, ProjectView } from "../shared/api.ts";

const api: DrylandApi = {
  getState: () => ipcRenderer.invoke("state:get"),
  openProject: () => ipcRenderer.invoke("project:open"),
  dismissLegend: () => ipcRenderer.invoke("legend:dismiss"),
  setLiveEventsPanel: (mode) => ipcRenderer.invoke("live-events:mode", mode),
  saveTabs: (tabs) => ipcRenderer.invoke("tabs:save", tabs),
  saveSessionsLayout: (layout) => ipcRenderer.invoke("sessions-layout:save", layout),
  readItem: (ref) => ipcRenderer.invoke("item:read", ref),
  openTerminal: () => ipcRenderer.invoke("terminal:open"),
  listAgents: () => ipcRenderer.invoke("agents:list"),
  listSkills: (agentId) => ipcRenderer.invoke("skills:list", agentId),
  startWork: (target, agentId, skill) => ipcRenderer.invoke("work:start", target, agentId, skill),
  resumeSession: (ticket, mode) => ipcRenderer.invoke("work:resume", ticket, mode),
  runTicketAction: (action, commit) => ipcRenderer.invoke("tracker:run", action, commit),
  dontAskAgain: (type) => ipcRenderer.invoke("confirmations:dont-ask", type),
  writeTerminal: (id, data) => ipcRenderer.send("terminal:write", id, data),
  resizeTerminal: (id, cols, rows) => ipcRenderer.send("terminal:resize", id, cols, rows),
  closeTerminal: (id) => ipcRenderer.send("terminal:close", id),
  viewTerminal: (id) => ipcRenderer.send("terminal:view", id),
  replayTerminal: (id) => ipcRenderer.invoke("terminal:replay", id),
  stopSession: (sessionId) => ipcRenderer.invoke("session:stop", sessionId),
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
  onMenuCommand(callback) {
    const listener = (_event: unknown, command: MenuCommand) => callback(command);
    ipcRenderer.on("menu:command", listener);
    return () => ipcRenderer.removeListener("menu:command", listener);
  },
  onSessionStates(callback) {
    const listener = (_event: unknown, states: Readonly<Record<string, SessionState>>) => callback(states);
    ipcRenderer.on("sessions:states", listener);
    return () => ipcRenderer.removeListener("sessions:states", listener);
  },
  onUnseenSessions(callback) {
    const listener = (_event: unknown, sessionIds: string[]) => callback(sessionIds);
    ipcRenderer.on("sessions:unseen", listener);
    return () => ipcRenderer.removeListener("sessions:unseen", listener);
  },
};

contextBridge.exposeInMainWorld("dryland", api);
