import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DrylandError } from "./errors.ts";

export const TRACKER_DOC = "docs/agents/issue-tracker.md";

export type TrackerKind = "local-markdown" | "github" | "gitlab";

const HEADINGS: Record<string, TrackerKind> = {
  "local markdown": "local-markdown",
  github: "github",
  gitlab: "gitlab",
};

/**
 * Whether the tracker doc sends agents through the `dryland` CLI, which makes the repo's tracker the ADE tracker.
 * A doc that never mentions it describes a plain native tracker, which Dryland reads in lens mode.
 */
export const isAdeTrackerDoc = (doc: string): boolean => /\bdryland\b/i.test(doc);

export interface TrackerInfo {
  kind: TrackerKind;
  /** A plain native tracker: Dryland reads and launches, and claims are best-effort. */
  lens: boolean;
}

/** Reads which tracker the repo uses, and whether it is the ADE tracker, from `docs/agents/issue-tracker.md`. */
export async function readTrackerInfo(mainCheckout: string): Promise<TrackerInfo> {
  const doc = await readTrackerDoc(mainCheckout);
  return { kind: trackerKindOf(doc), lens: !isAdeTrackerDoc(doc) };
}

/** Reads which tracker the repo uses from the title of `docs/agents/issue-tracker.md`. */
export async function readTrackerKind(mainCheckout: string): Promise<TrackerKind> {
  return trackerKindOf(await readTrackerDoc(mainCheckout));
}

async function readTrackerDoc(mainCheckout: string): Promise<string> {
  const doc = await readFile(join(mainCheckout, TRACKER_DOC), "utf8").catch(() => null);
  if (doc === null) {
    throw new DrylandError(
      `${TRACKER_DOC} is missing, so Dryland cannot tell which issue tracker this repo uses.`,
      "Run /setup-matt-pocock-skills to create it.",
    );
  }
  return doc;
}

function trackerKindOf(doc: string): TrackerKind {
  const title = /^# Issue tracker:\s*(.+?)\s*$/m.exec(doc)?.[1] ?? "unrecognised";
  const kind = HEADINGS[title.toLowerCase()];
  if (kind === undefined) {
    throw new DrylandError(
      `Issue tracker "${title}" in ${TRACKER_DOC} is not supported.`,
      "Dryland reads local-markdown, GitHub and GitLab trackers. Re-run /setup-matt-pocock-skills and pick one of them.",
    );
  }
  return kind;
}
