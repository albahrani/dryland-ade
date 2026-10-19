import { useState } from "react";
import { LIVE_EVENTS_PANEL_MODES, type AppSettings, type LiveEventsPanelMode } from "../../shared/api.ts";
import type { SettingsChange } from "../../shared/settings-change.ts";
import { STOP_CONFIRMATION_LABELS, STOP_CONFIRMATIONS } from "../../shared/stop-session.ts";
import { CONFIRMATION_LABELS, CONFIRMATION_TYPES } from "../../shared/tracker-actions.ts";

const TABS = ["General", "Agent CLIs", "Tracker", "Skills", "Write confirmations", "Updates"] as const;
type SettingsTab = (typeof TABS)[number];

/** The ticket that fills each tab still to come. */
const COMING: Partial<Record<SettingsTab, string>> = {
  "Agent CLIs": "The Agent CLIs tab arrives with ticket 56.",
  Skills: "The Skills tab arrives with ticket 56.",
  Updates: "The Updates tab arrives with ticket 58.",
};

const PANEL_LABELS: Record<LiveEventsPanelMode, string> = {
  expanded: "Expanded",
  line: "Newest line only",
  hidden: "Hidden",
};

/** The Settings modal: app-wide preferences by tab, saying which level, global or this project's, a setting sits at. */
export function SettingsDialog({
  settings,
  projectName,
  liveEventsPanel,
  legendDismissed,
  onChange,
  onLiveEventsPanel,
  onClose,
}: {
  settings: AppSettings;
  /** The open project; `null` when none is open, so there is nothing to override. */
  projectName: string | null;
  liveEventsPanel: LiveEventsPanelMode;
  legendDismissed: boolean;
  onChange: (change: SettingsChange) => void;
  onLiveEventsPanel: (mode: LiveEventsPanelMode) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<SettingsTab>("General");
  const overridden = settings.projectAutoCommit !== null;
  return (
    <div className="modal-backdrop">
      <div className="modal settings" role="dialog" aria-modal="true" aria-label="Settings">
        <h2>Settings</h2>
        <div role="tablist" aria-label="Settings tabs" className="settings-tabs">
          {TABS.map((name) => (
            <button
              key={name}
              role="tab"
              aria-selected={tab === name}
              aria-controls="settings-panel"
              onClick={() => setTab(name)}
            >
              {name}
            </button>
          ))}
        </div>
        <div role="tabpanel" id="settings-panel" aria-label={tab} className="settings-panel">
          {COMING[tab] !== undefined && <p className="dim">{COMING[tab]}</p>}
          {tab === "General" && (
            <>
              <p className="dim">These apply to the whole app.</p>
              <label>
                Live-events panel{" "}
                <select
                  value={liveEventsPanel}
                  onChange={(event) => onLiveEventsPanel(event.target.value as LiveEventsPanelMode)}
                >
                  {LIVE_EVENTS_PANEL_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {PANEL_LABELS[mode]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Ask before stopping a session{" "}
                <select
                  value={settings.stopConfirmation}
                  onChange={(event) =>
                    onChange({
                      kind: "stop-confirmation",
                      value: event.target.value as typeof settings.stopConfirmation,
                    })
                  }
                >
                  {STOP_CONFIRMATIONS.map((rule) => (
                    <option key={rule} value={rule}>
                      {STOP_CONFIRMATION_LABELS[rule]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={settings.resumeOnStart}
                  onChange={(event) => onChange({ kind: "resume-on-start", value: event.target.checked })}
                />
                Resume sessions on start
              </label>
              <label>
                Keep sessions for{" "}
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={settings.sessionRetentionDays}
                  onChange={(event) => {
                    const days = event.target.valueAsNumber;
                    if (Number.isInteger(days) && days > 0) onChange({ kind: "session-retention", value: days });
                  }}
                />{" "}
                days after they were last seen
              </label>
              <div>
                <button disabled={!legendDismissed} onClick={() => onChange({ kind: "reset-legend" })}>
                  Show the legend again
                </button>
              </div>
            </>
          )}
          {tab === "Tracker" && (
            <>
              <h3>Global</h3>
              <label>
                <input
                  type="checkbox"
                  checked={settings.globalAutoCommit}
                  onChange={(event) => onChange({ kind: "auto-commit", value: event.target.checked })}
                />
                Auto-commit tracker writes
              </label>
              <h3>{projectName === null ? "This project" : `This project (${projectName})`}</h3>
              {projectName === null ? (
                <p className="dim">Open a project to override auto-commit for it.</p>
              ) : (
                <>
                  <label>
                    <input
                      type="checkbox"
                      checked={settings.autoCommit}
                      onChange={(event) => onChange({ kind: "project-auto-commit", value: event.target.checked })}
                    />
                    Auto-commit tracker writes in this project
                  </label>
                  {overridden ? (
                    <p role="status">
                      Overridden for this project: {settings.projectAutoCommit ? "on" : "off"}, whatever the global
                      setting says.{" "}
                      <button onClick={() => onChange({ kind: "project-auto-commit", value: null })}>
                        Clear override
                      </button>
                    </p>
                  ) : (
                    <p className="dim">Following the global setting.</p>
                  )}
                </>
              )}
            </>
          )}
          {tab === "Write confirmations" && (
            <>
              <p className="dim">Confirmations you chose not to be asked about again. They apply to every project.</p>
              <ul className="confirmations">
                {CONFIRMATION_TYPES.map((type) => (
                  <li key={type}>
                    <span>{CONFIRMATION_LABELS[type]}</span>{" "}
                    <span className="dim">{settings.dontAsk[type] ? "Not asked" : "Asked"}</span>{" "}
                    <button
                      aria-label={`Reset ${CONFIRMATION_LABELS[type]}`}
                      disabled={!settings.dontAsk[type]}
                      onClick={() => onChange({ kind: "reset-confirmation", type })}
                    >
                      Reset
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div className="modal-actions">
          <button className="primary" autoFocus onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
