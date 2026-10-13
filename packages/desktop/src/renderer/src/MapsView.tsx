import type { TicketsTree, TicketsTreeMap } from "@dryland/core";
import { useState } from "react";
import { type MapProgress, mapProgress, PROGRESS_ORDER, type ProgressSegment } from "../../shared/map-progress.ts";
import { STATUS_META } from "../../shared/status-meta.ts";
import type { ItemRef } from "../../shared/tabs.ts";

/** Bar segments are the ticket statuses plus fog, which is not a ticket status. */
const SEGMENT_META: Record<ProgressSegment, { label: string; colour: string }> = {
  ...STATUS_META,
  fog: { label: "Fog", colour: "var(--fg-dim)" },
};

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

function StatsCard({ map }: { map: TicketsTreeMap }) {
  const { counts, total } = mapProgress(map);
  return (
    <section className="stats-card" aria-label={`${map.title} statistics`}>
      <h3>{map.title}</h3>
      <dl>
        {PROGRESS_ORDER.map((s) => (
          <div key={s}>
            <dt>
              <span className="swatch" style={{ background: SEGMENT_META[s].colour }} /> {SEGMENT_META[s].label}
            </dt>
            <dd>{counts[s]}</dd>
          </div>
        ))}
        <div>
          <dt>Total</dt>
          <dd>{total}</dd>
        </div>
      </dl>
    </section>
  );
}

export function MapsView({
  tree,
  activeMap,
  onOpen,
}: {
  tree: TicketsTree;
  /** The map whose tab is focused, if any. */
  activeMap: string | null;
  onOpen: (ref: ItemRef) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const selected = tree.maps.find((m) => m.name === (activeMap ?? picked)) ?? null;
  return (
    <section className="maps" aria-label="Maps">
      <header className="view-header">
        <h2>Maps</h2>
      </header>
      {tree.maps.length === 0 && <p className="empty">This project has no maps yet.</p>}
      <ul className="map-list">
        {tree.maps.map((map) => (
          <li key={map.name}>
            <button
              className="map-row"
              aria-pressed={selected?.name === map.name}
              onClick={() => {
                setPicked(map.name);
                onOpen({ kind: "map", name: map.name });
              }}
            >
              <span className="map-title">{map.title}</span>
              <ProgressBar map={map} />
            </button>
          </li>
        ))}
      </ul>
      {selected !== null && <StatsCard map={selected} />}
    </section>
  );
}
