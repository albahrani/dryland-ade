import {
  releaseUrl,
  type UpdateChannel,
  type UpdateMode,
  type UpdateState,
  type UpdateStatus,
} from "../shared/updates.ts";

/** Automatic checks are at most this far apart. */
export const DAILY_CHECK_MS = 24 * 60 * 60 * 1000;

/** Where updates come from; `electron-updater` in the app, a fake in tests. */
export interface UpdateSource {
  /** The newest release of `channel` that is newer than the running app; `null` when there is none. */
  check(channel: UpdateChannel): Promise<{ version: string } | null>;
  /** Downloads what the last `check` found. The download is installed when the app next quits. */
  download(): Promise<void>;
}

export interface UpdaterOptions {
  source: UpdateSource;
  mode: UpdateMode;
  /** The running app's version. */
  version: string;
  now: () => number;
  /** What survives a restart. */
  saved: {
    channel: () => UpdateChannel;
    lastCheck: () => string | null;
    setChannel: (channel: UpdateChannel) => void;
    setLastCheck: (iso: string) => void;
  };
  onChange: (state: UpdateState) => void;
}

export interface Updater {
  state(): UpdateState;
  /** A check the user asked for; runs at any time. */
  checkNow(): Promise<void>;
  /** A check the app starts on its own; skipped when one ran in the last day. */
  automatic(): Promise<void>;
  /** Switches channel and checks it at once. */
  setChannel(channel: UpdateChannel): Promise<void>;
}

/**
 * The decisions about updating: which channel is checked, how often, and what a found update leads to on this
 * platform. Failures end as a status the Updates tab shows; nothing here throws or interrupts the app.
 */
export function createUpdater(options: UpdaterOptions): Updater {
  const { source, mode, version, now, saved, onChange } = options;
  let status: UpdateStatus = { kind: "idle" };
  let running: Promise<void> | null = null;

  const state = (): UpdateState => ({
    version,
    channel: saved.channel(),
    mode,
    lastCheck: saved.lastCheck(),
    status,
  });
  const set = (next: UpdateStatus) => {
    status = next;
    onChange(state());
  };

  async function run(): Promise<void> {
    const channel = saved.channel();
    set({ kind: "checking" });
    // Counted when it starts, so a failing network is not retried every launch of the hour.
    saved.setLastCheck(new Date(now()).toISOString());
    let found: { version: string } | null;
    try {
      found = await source.check(channel);
    } catch (error) {
      if (nothingPublished(error)) return set({ kind: "up-to-date" });
      return set({ kind: "failed", message: messageOf(error) });
    }
    if (found === null) return set({ kind: "up-to-date" });
    if (mode === "notify") return set({ kind: "available", version: found.version, url: releaseUrl(found.version) });
    set({ kind: "downloading", version: found.version });
    try {
      await source.download();
    } catch (error) {
      return set({ kind: "failed", message: messageOf(error) });
    }
    set({ kind: "ready", version: found.version });
  }

  /** One check or download at a time, and none while an update waits for the next quit. */
  function start(): Promise<void> {
    if (mode === "off" || status.kind === "ready") return Promise.resolve();
    running ??= run().finally(() => (running = null));
    return running;
  }

  return {
    state,
    checkNow: start,
    async automatic() {
      const last = saved.lastCheck();
      if (last !== null && now() - Date.parse(last) < DAILY_CHECK_MS) return;
      await start();
    },
    async setChannel(channel) {
      if (channel === saved.channel()) return;
      saved.setChannel(channel);
      // What was found on the other channel says nothing about this one.
      await running;
      set({ kind: "idle" });
      await start();
    },
  };
}

/**
 * The codes `electron-updater` fails a check with when there is nothing published to update to: no release, no
 * published version, or a release whose update files are not public, such as a draft. That is the normal state
 * before the first release and for the beta channel, so it reads as up to date rather than as an error. The cost: a
 * release published without its update files reads as up to date too; the release workflow attaches them.
 */
const NOTHING_PUBLISHED = new Set([
  "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND",
  "ERR_UPDATER_LATEST_VERSION_NOT_FOUND",
  "ERR_UPDATER_NO_PUBLISHED_VERSIONS",
  "ERR_UPDATER_RELEASE_NOT_FOUND",
]);

/**
 * With a draft listed in the releases feed and no production release, `electron-updater` wraps the inner "latest
 * version not found" failure in its feed-parsing error, so only the message tells it from a feed that is really broken.
 */
const NO_PRODUCTION_RELEASE = "Unable to find latest version on GitHub";

const nothingPublished = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (NOTHING_PUBLISHED.has(String(code))) return true;
  return code === "ERR_UPDATER_INVALID_RELEASE_FEED" && String(message).includes(NO_PRODUCTION_RELEASE);
};

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));
