import { useState } from "react";
import type { AgentHooksAction } from "../../shared/agent-hooks.ts";
import { AgentClisTab } from "./AgentClisTab.tsx";
import { UpdatesTab } from "./UpdatesTab.tsx";
import type { AppSettings } from "../../shared/api.ts";
import type { SettingsChange } from "../../shared/settings-change.ts";
import { STOP_CONFIRMATION_LABELS, STOP_CONFIRMATIONS } from "../../shared/stop-session.ts";
import { CONFIRMATION_LABELS, CONFIRMATION_TYPES } from "../../shared/tracker-actions.ts";

const TABS = ["General", "Agent CLIs", "Write confirmations", "Updates"] as const;
type SettingsTab = (typeof TABS)[number];

/** The Settings modal: app-wide preferences by tab. */
export function SettingsDialog({
  settings,
  legendDismissed,
  hooksRevision,
  onChange,
  onHooks,
  onClose,
}: {
  settings: AppSettings;
  legendDismissed: boolean;
  hooksRevision: number;
  onChange: (change: SettingsChange) => void;
  onHooks: (agentId: string, action: AgentHooksAction) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<SettingsTab>("General");
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
          {tab === "Updates" && <UpdatesTab />}
          {tab === "General" && (
            <>
              <p className="dim">These apply to the whole app.</p>
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
          {tab === "Agent CLIs" && <AgentClisTab hooksRevision={hooksRevision} onHooks={onHooks} />}
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
