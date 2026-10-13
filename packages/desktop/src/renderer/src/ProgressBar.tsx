import type { TicketsTreeMap } from "@dryland/core";
import { type MapProgress, mapProgress, PROGRESS_ORDER, SEGMENT_META } from "../../shared/map-progress.ts";

function summary(counts: MapProgress["counts"]): string {
  return PROGRESS_ORDER.filter((s) => counts[s] > 0)
    .map((s) => `${counts[s]} ${SEGMENT_META[s].label.toLowerCase()}`)
    .join(", ");
}

/** The stacked bar of a map: one segment per status, then fog, sized by count. */
export function ProgressBar({ map }: { map: TicketsTreeMap }) {
  const { counts, total } = mapProgress(map);
  return (
    <div className="progress" role="img" aria-label={total === 0 ? "No tickets or fog" : summary(counts)}>
      {PROGRESS_ORDER.filter((s) => counts[s] > 0).map((s) => (
        <span key={s} style={{ flexGrow: counts[s], background: SEGMENT_META[s].colour }} />
      ))}
    </div>
  );
}
