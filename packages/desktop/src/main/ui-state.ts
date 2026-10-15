import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { LIVE_EVENTS_PANEL_MODES, type LiveEventsPanelMode } from "../shared/api.ts";
import { parseTabs, type TabsState } from "../shared/tabs.ts";

/** The small local UI state Dryland keeps; the repo stays the source of truth for everything else. */
export interface UiState {
  /** The project (repo path) open when the app last ran. */
  lastProject: string | null;
  legendDismissed: boolean;
  /** The editor tabs open in each project, by project path. */
  tabs: Record<string, TabsState>;
  liveEventsPanel: LiveEventsPanelMode;
}

const DEFAULTS: UiState = { lastProject: null, legendDismissed: false, tabs: {}, liveEventsPanel: "expanded" };

export interface UiStateStore {
  read(): UiState;
  update(patch: Partial<UiState>): UiState;
}

function parseAllTabs(raw: unknown): Record<string, TabsState> {
  if (raw === null || typeof raw !== "object") return {};
  return Object.fromEntries(Object.entries(raw).map(([project, tabs]) => [project, parseTabs(tabs)]));
}

/** Reads each field on its own, so one wrong value never discards the others. */
function parse(text: string): UiState {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { ...DEFAULTS };
  }
  if (raw === null || typeof raw !== "object") return { ...DEFAULTS };
  return {
    lastProject: typeof raw.lastProject === "string" ? raw.lastProject : DEFAULTS.lastProject,
    legendDismissed: typeof raw.legendDismissed === "boolean" ? raw.legendDismissed : DEFAULTS.legendDismissed,
    tabs: parseAllTabs(raw.tabs),
    liveEventsPanel: LIVE_EVENTS_PANEL_MODES.includes(raw.liveEventsPanel as LiveEventsPanelMode)
      ? (raw.liveEventsPanel as LiveEventsPanelMode)
      : DEFAULTS.liveEventsPanel,
  };
}

export function createUiStateStore(file: string): UiStateStore {
  const read = (): UiState => {
    try {
      return parse(readFileSync(file, "utf8"));
    } catch {
      return { ...DEFAULTS };
    }
  };
  return {
    read,
    update(patch) {
      const next = { ...read(), ...patch };
      mkdirSync(dirname(file), { recursive: true });
      const temp = `${file}.tmp`;
      writeFileSync(temp, JSON.stringify(next, null, 2));
      renameSync(temp, file); // atomic, so a quit mid-write never leaves half a file
      return next;
    },
  };
}
