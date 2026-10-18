import type { TicketsTree, TicketsTreeMap } from "@dryland/core";
import { useState } from "react";
import { mapProgress, PROGRESS_ORDER, SEGMENT_META } from "../../shared/map-progress.ts";
import { mapMarker, type NextUp } from "../../shared/next-up.ts";
import type { ItemRef } from "../../shared/tabs.ts";
import type { MapSessionCounts } from "../../shared/sessions-view.ts";
import { NextUpStar } from "./NextUp.tsx";
import { MapCounts } from "./status.tsx";
import { ProgressBar } from "./ProgressBar.tsx";
import { StartWork, type StartHandler } from "./StartWork.tsx";

function StatsCard({ map, onContinue }: { map: TicketsTreeMap; onContinue: StartHandler }) {
  const { counts, total } = mapProgress(map);
  return (
    <section className="stats-card" aria-label={`${map.title} statistics`}>
      <h3>{map.title}</h3>
      <StartWork onStart={onContinue} label={(agent) => `Continue map with ${agent}`} />
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
  nextUp,
  mapCounts,
  onOpen,
  onContinue,
  onNewMap,
}: {
  tree: TicketsTree;
  /** The map whose tab is focused, if any. */
  activeMap: string | null;
  nextUp: NextUp;
  /** A map's waiting and paused session counts. */
  mapCounts: (map: string) => MapSessionCounts;
  onOpen: (ref: ItemRef) => void;
  /** Starts a session on the map with `/wayfinder <map>` typed. */
  onContinue: (map: string, agentId: string, skill: string | null) => Promise<void>;
  onNewMap: () => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const selected = tree.maps.find((m) => m.name === (activeMap ?? picked)) ?? null;
  return (
    <section className="maps" aria-label="Maps">
      <header className="view-header">
        <h2>Maps</h2>
        <button aria-label="New map" title="New map" onClick={onNewMap}>
          +
        </button>
      </header>
      {tree.maps.length === 0 && <p className="empty">This project has no maps yet.</p>}
      <ul className="map-list">
        {tree.maps.map((map) => {
          // Only a marker on the map itself: a marked ticket shows in the Tickets view, so the two never blur.
          const marker = mapMarker(nextUp, map.name);
          return (
            <li key={map.name} className={marker === undefined ? undefined : "next-up"} title={marker?.step.reason}>
              <button
                className="map-row"
                aria-pressed={selected?.name === map.name}
                onClick={() => {
                  setPicked(map.name);
                  onOpen({ kind: "map", name: map.name });
                }}
              >
                <span className="map-title">
                  {map.title} {marker !== undefined && <NextUpStar marker={marker} />}{" "}
                  <MapCounts counts={mapCounts(map.name)} />
                </span>
                <ProgressBar map={map} />
              </button>
            </li>
          );
        })}
      </ul>
      {selected !== null && (
        <StatsCard
          key={selected.name}
          map={selected}
          onContinue={(agentId, skill) => onContinue(selected.name, agentId, skill)}
        />
      )}
    </section>
  );
}
