/** A ticket's unresolved blockers as one phrase: the ids, `"unknown"`, or `null` when nothing blocks it. */
export function formatBlockers(blockers: string[] | "unknown"): string | null {
  if (blockers === "unknown") return "unknown";
  return blockers.length === 0 ? null : blockers.join(", ");
}
