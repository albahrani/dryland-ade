import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { TRIAGE_ROLES, type TriageRole } from "./ticket.ts";

export const TRIAGE_LABELS_DOC = "docs/agents/triage-labels.md";

/** The label the repo uses for each role, as its triage-labels doc writes it; a role without a row is its own label. */
export async function readTriageLabels(mainCheckout: string): Promise<Map<TriageRole, string>> {
  const labels = new Map<TriageRole, string>(TRIAGE_ROLES.map((role) => [role, role]));
  const doc = await readFile(join(mainCheckout, TRIAGE_LABELS_DOC), "utf8").catch(() => "");
  for (const line of doc.replace(/\r\n/g, "\n").split("\n")) {
    const cells = line.split("|").map((cell) => cell.replace(/`/g, "").trim());
    const role = TRIAGE_ROLES.find((known) => known === cells[1]);
    const label = cells[2];
    if (role !== undefined && label) labels.set(role, label);
  }
  return labels;
}
