import type { TrackerWidgetInfo } from "@dryland/core";

/** The tracker-specific action the widget offers, which the main process carries out. */
export interface TrackerWidgetAction {
  kind: "reveal-issues" | "open-issues";
  label: string;
}

/** What the menu bar's tracker widget shows: the tracker, its one action, and the notes to warn with. */
export interface TrackerWidgetView {
  label: string;
  action: TrackerWidgetAction | null;
  notes: string[];
}

const NAMES = { "local-markdown": "Local markdown", github: "GitHub", gitlab: "GitLab" } as const;

export function trackerWidgetView(info: TrackerWidgetInfo | null): TrackerWidgetView {
  if (info === null) return { label: "No tracker", action: null, notes: [] };
  const notes: string[] = [];
  if (info.offDefaultBranch !== null) {
    const { current, defaultBranch } = info.offDefaultBranch;
    notes.push(
      `The main checkout is on ${current ?? "a detached HEAD"}, not ${defaultBranch}: the tickets shown are that branch's.`,
    );
  }
  if (info.lens) notes.push("Lens mode: Dryland reads and launches, and claims are best-effort.");
  return {
    label: info.lens ? `${NAMES[info.kind]} (lens mode)` : NAMES[info.kind],
    action:
      info.kind === "local-markdown"
        ? { kind: "reveal-issues", label: "Reveal issues folder" }
        : { kind: "open-issues", label: "Open issues in browser" },
    notes,
  };
}
