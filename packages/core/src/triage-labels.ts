import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { TRIAGE_ROLES, type TriageRole } from "./ticket.ts";

export const TRIAGE_LABELS_DOC = "docs/agents/triage-labels.md";

/** Maps the label strings a repo uses (lower-cased) to the canonical triage role they stand for. */
export type TriageVocabulary = Map<string, TriageRole>;

/** The default vocabulary: each role is its own label. */
export function defaultTriageVocabulary(): TriageVocabulary {
  return new Map(TRIAGE_ROLES.map((role) => [role, role]));
}

/**
 * Reads the role table of `docs/agents/triage-labels.md`: first column the canonical role, second the
 * repo's label. A missing doc or row leaves the default label for that role.
 */
export async function readTriageVocabulary(mainCheckout: string): Promise<TriageVocabulary> {
  const vocabulary = defaultTriageVocabulary();
  const doc = await readFile(join(mainCheckout, TRIAGE_LABELS_DOC), "utf8").catch(() => "");
  for (const line of doc.replace(/\r\n/g, "\n").split("\n")) {
    const cells = line.split("|").map((cell) => cell.replace(/`/g, "").trim());
    const role = TRIAGE_ROLES.find((known) => known === cells[1]);
    const label = cells[2];
    if (role !== undefined && label) vocabulary.set(label.toLowerCase(), role);
  }
  return vocabulary;
}
