import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { DEFAULT_SESSION_RETENTION_DAYS } from "@dryland/core";
import { isLiveEventsPanelMode, type LiveEventsPanelMode } from "../shared/api.ts";
import { DEFAULT_STOP_CONFIRMATION, isStopConfirmation, type StopConfirmation } from "../shared/stop-session.ts";
import { isRetentionDays } from "../shared/settings-change.ts";
import { parseSessionsLayout, type SessionsLayout } from "../shared/sessions-view.ts";
import { parseProjects } from "../shared/projects.ts";
import { parseTabs, type TabsState } from "../shared/tabs.ts";
import { ASK_ALWAYS, CONFIRMATION_TYPES, type DontAsk } from "../shared/tracker-actions.ts";

/** The small local UI state Dryland keeps; the repo stays the source of truth for everything else. */
export interface UiState {
  /** The project (repo path) open when the app last ran. */
  lastProject: string | null;
  /** The projects open in the app, in the order they were opened; `lastProject` is the one shown. */
  openProjects: string[];
  legendDismissed: boolean;
  /** The editor tabs open in each project, by project path. */
  tabs: Record<string, TabsState>;
  /** The Sessions view's grouping, collapsed panes and sash position in each project, by project path. */
  sessionsLayout: Record<string, SessionsLayout>;
  liveEventsPanel: LiveEventsPanelMode;
  /** Whether the app's tracker writes are committed, unless a project overrides it. */
  autoCommit: boolean;
  /** Auto-commit overrides, by project path. */
  projectAutoCommit: Record<string, boolean>;
  /** Whether a session's pre-typed command is submitted, unless a project overrides it. */
  autoSubmit: boolean;
  /** Auto-submit overrides, by project path. */
  projectAutoSubmit: Record<string, boolean>;
  /** Each confirmation type's "do not ask again" flag. */
  dontAsk: DontAsk;
  /** When stopping a session asks first. */
  stopConfirmation: StopConfirmation;
  /** Whether starting the app resumes every paused session, hidden. */
  resumeOnStart: boolean;
  /** Days a session stays in the session index after it was last seen. */
  sessionRetentionDays: number;
}

const DEFAULTS: UiState = {
  lastProject: null,
  openProjects: [],
  legendDismissed: false,
  tabs: {},
  sessionsLayout: {},
  liveEventsPanel: "expanded",
  autoCommit: true,
  projectAutoCommit: {},
  autoSubmit: false,
  projectAutoSubmit: {},
  dontAsk: ASK_ALWAYS,
  stopConfirmation: DEFAULT_STOP_CONFIRMATION,
  resumeOnStart: false,
  sessionRetentionDays: DEFAULT_SESSION_RETENTION_DAYS,
};

export interface UiStateStore {
  read(): UiState;
  update(patch: Partial<UiState>): UiState;
}

function parseAllTabs(raw: unknown): Record<string, TabsState> {
  if (raw === null || typeof raw !== "object") return {};
  return Object.fromEntries(Object.entries(raw).map(([project, tabs]) => [project, parseTabs(tabs)]));
}

function parseAllLayouts(raw: unknown): Record<string, SessionsLayout> {
  if (raw === null || typeof raw !== "object") return {};
  return Object.fromEntries(Object.entries(raw).map(([project, layout]) => [project, parseSessionsLayout(layout)]));
}

function parseOverrides(raw: unknown): Record<string, boolean> {
  if (raw === null || typeof raw !== "object") return {};
  return Object.fromEntries(
    Object.entries(raw).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"),
  );
}

function parseDontAsk(raw: unknown): DontAsk {
  const flags = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(CONFIRMATION_TYPES.map((type) => [type, flags[type] === true])) as DontAsk;
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
    openProjects: parseProjects(raw.openProjects),
    legendDismissed: typeof raw.legendDismissed === "boolean" ? raw.legendDismissed : DEFAULTS.legendDismissed,
    tabs: parseAllTabs(raw.tabs),
    sessionsLayout: parseAllLayouts(raw.sessionsLayout),
    liveEventsPanel: isLiveEventsPanelMode(raw.liveEventsPanel) ? raw.liveEventsPanel : DEFAULTS.liveEventsPanel,
    autoCommit: typeof raw.autoCommit === "boolean" ? raw.autoCommit : DEFAULTS.autoCommit,
    projectAutoCommit: parseOverrides(raw.projectAutoCommit),
    autoSubmit: typeof raw.autoSubmit === "boolean" ? raw.autoSubmit : DEFAULTS.autoSubmit,
    projectAutoSubmit: parseOverrides(raw.projectAutoSubmit),
    dontAsk: parseDontAsk(raw.dontAsk),
    stopConfirmation: isStopConfirmation(raw.stopConfirmation) ? raw.stopConfirmation : DEFAULTS.stopConfirmation,
    resumeOnStart: typeof raw.resumeOnStart === "boolean" ? raw.resumeOnStart : DEFAULTS.resumeOnStart,
    sessionRetentionDays: isRetentionDays(raw.sessionRetentionDays)
      ? raw.sessionRetentionDays
      : DEFAULTS.sessionRetentionDays,
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
