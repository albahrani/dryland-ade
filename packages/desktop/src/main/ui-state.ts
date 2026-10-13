import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** The small local UI state Dryland keeps; the repo stays the source of truth for everything else. */
export interface UiState {
  /** The project (repo path) open when the app last ran. */
  lastProject: string | null;
  legendDismissed: boolean;
}

const DEFAULTS: UiState = { lastProject: null, legendDismissed: false };

export interface UiStateStore {
  read(): UiState;
  update(patch: Partial<UiState>): UiState;
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
