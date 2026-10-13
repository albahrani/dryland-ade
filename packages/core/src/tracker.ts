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

/** Reads which tracker the repo uses from the title of `docs/agents/issue-tracker.md`. */
export async function readTrackerKind(mainCheckout: string): Promise<TrackerKind> {
  const doc = await readFile(join(mainCheckout, TRACKER_DOC), "utf8").catch(() => null);
  if (doc === null) {
    throw new DrylandError(
      `${TRACKER_DOC} is missing, so Dryland cannot tell which issue tracker this repo uses.`,
      "Run /setup-matt-pocock-skills to create it.",
    );
  }
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
