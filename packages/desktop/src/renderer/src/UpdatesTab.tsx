import { useEffect, useState } from "react";
import {
  isUpdateChannel,
  UPDATE_CHANNELS,
  type UpdateChannel,
  type UpdateMode,
  type UpdateState,
  type UpdateStatus,
} from "../../shared/updates.ts";

const CHANNEL_LABELS: Record<UpdateChannel, string> = {
  latest: "Latest (stable releases)",
  beta: "Beta (includes pre-releases)",
};

const MODE_NOTES: Record<UpdateMode, string> = {
  auto: "Updates download in the background and install the next time you quit.",
  notify: "This install is notify-only: a found update links its release page and nothing is downloaded.",
  off: "Updates are off: this is not an installed build.",
};

function statusText(status: UpdateStatus): string {
  switch (status.kind) {
    case "idle":
      return "No check yet in this run.";
    case "checking":
      return "Checking for updates…";
    case "up-to-date":
      return "Dryland ADE is up to date.";
    case "available":
      return `Version ${status.version} is available.`;
    case "downloading":
      return `Downloading version ${status.version}…`;
    case "ready":
      return `Version ${status.version} is downloaded and installs when you quit.`;
    case "failed":
      return `The last check did not finish: ${status.message}`;
  }
}

/** The Settings tab for updates: version, release channel, the last check and what a found update leads to. */
export function UpdatesTab() {
  const [state, setState] = useState<UpdateState | null>(null);
  useEffect(() => {
    let current = true;
    void window.dryland.updateState().then((initial) => current && setState((seen) => seen ?? initial));
    const stop = window.dryland.onUpdateChanged(setState);
    return () => {
      current = false;
      stop();
    };
  }, []);
  if (state === null) return <p className="dim">Reading update state…</p>;
  const busy = state.status.kind === "checking" || state.status.kind === "downloading";
  return (
    <>
      <p>
        Version <strong>{state.version}</strong>
      </p>
      <label>
        Channel{" "}
        <select
          value={state.channel}
          onChange={(event) => {
            if (isUpdateChannel(event.target.value)) void window.dryland.setUpdateChannel(event.target.value);
          }}
        >
          {UPDATE_CHANNELS.map((channel) => (
            <option key={channel} value={channel}>
              {CHANNEL_LABELS[channel]}
            </option>
          ))}
        </select>
      </label>
      <p className="dim">{MODE_NOTES[state.mode]}</p>
      <p>Last check: {state.lastCheck === null ? "never" : new Date(state.lastCheck).toLocaleString()}</p>
      <p role="status">{statusText(state.status)}</p>
      <div>
        <button disabled={busy || state.mode === "off"} onClick={() => void window.dryland.checkForUpdates()}>
          Check now
        </button>{" "}
        {state.status.kind === "available" && (
          <button onClick={() => void window.dryland.openUpdateRelease()}>Open the release page</button>
        )}
      </div>
    </>
  );
}
