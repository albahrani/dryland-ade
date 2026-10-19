import type { NextUpMarker, SessionState } from "@dryland/core";

/** One open project as the All Projects dialog lists it. */
export interface ProjectSummary {
  path: string;
  name: string;
  /** Where its tickets live; `null` when the project cannot be read. */
  tracker: string | null;
  /** Sessions in this project whose Agent CLI still runs. */
  liveSessions: number;
  /** The item its best next step points at; `null` when none does or the project cannot be read. */
  nextUp: NextUpMarker | null;
  /** Why it cannot be read, when it cannot. */
  error: string | null;
}

/** Adds `path` at the end of the open projects, once. */
export function addProject(open: readonly string[], path: string): string[] {
  return open.includes(path) ? [...open] : [...open, path];
}

export function removeProject(open: readonly string[], path: string): string[] {
  return open.filter((p) => p !== path);
}

/** Reads a saved list of open projects defensively: anything that is not a path, and repeats, is dropped. */
export function parseProjects(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.reduce<string[]>(
    (open, entry) => (typeof entry === "string" && entry !== "" ? addProject(open, entry) : open),
    [],
  );
}

/** The open projects after `closed` closes, and the one to show: unchanged unless it was the current one. */
export function closeProject(
  open: readonly string[],
  closed: string,
  current: string | null,
): { open: string[]; current: string | null } {
  const index = open.indexOf(closed);
  if (index === -1) return { open: [...open], current };
  const rest = removeProject(open, closed);
  if (current !== closed) return { open: rest, current };
  return { open: rest, current: rest[index] ?? rest[index - 1] ?? null };
}

/** The sessions that belong to project `path`; none for `null`. */
export function projectSessions<T extends { project: string }>(sessions: readonly T[], path: string | null): T[] {
  return path === null ? [] : sessions.filter((s) => s.project === path);
}

/** How many of project `path`'s sessions have not ended. A session with no state yet has just launched. */
export function liveSessionCount(
  sessions: readonly { id: string; project: string }[],
  states: Readonly<Record<string, SessionState>>,
  path: string,
): number {
  return projectSessions(sessions, path).filter((s) => (states[s.id] ?? "launched") !== "ended").length;
}
