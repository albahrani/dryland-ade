import type { TicketsTree, TicketsTreeMap } from "@dryland/core";
import { useState } from "react";
import { mapProgress, PROGRESS_ORDER, SEGMENT_META } from "../../shared/map-progress.ts";
import type { ItemRef } from "../../shared/tabs.ts";
import { ProgressBar } from "./ProgressBar.tsx";

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
