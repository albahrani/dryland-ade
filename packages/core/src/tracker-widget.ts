import { DrylandError } from "./errors.ts";
import type { ProcessRunner } from "./process-runner.ts";
import { type TrackerInfo, readTrackerInfo } from "./tracker.ts";
import { defaultBranch } from "./tracker-write.ts";

/** What the menu bar's tracker widget shows of a project. */
export interface TrackerWidgetInfo extends TrackerInfo {
  /**
   * Set for local markdown when the main checkout, where tracker state lives, is not on the default branch: tickets
   * read from there are not the default branch's. `current` is `null` for a detached HEAD.
   */
  offDefaultBranch: { current: string | null; defaultBranch: string } | null;
}

/** The tracker widget's data for `mainCheckout`; `null` when its tracker doc is missing or names no tracker Dryland reads. */
export async function readTrackerWidget(
  runner: ProcessRunner,
  mainCheckout: string,
): Promise<TrackerWidgetInfo | null> {
  let info: TrackerInfo;
  try {
    info = await readTrackerInfo(mainCheckout);
  } catch (error) {
    if (error instanceof DrylandError) return null;
    throw error;
  }
  if (info.kind !== "local-markdown") return { ...info, offDefaultBranch: null };
  const expected = await defaultBranch(runner, mainCheckout);
  const shown = await runner.run("git", ["branch", "--show-current"], { cwd: mainCheckout });
  if (expected === null || shown.exitCode !== 0) return { ...info, offDefaultBranch: null };
  const current = shown.stdout.trim() || null;
  return { ...info, offDefaultBranch: current === expected ? null : { current, defaultBranch: expected } };
}
