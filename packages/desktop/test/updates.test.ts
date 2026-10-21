import { describe, expect, it } from "vitest";
import { createUpdater, DAILY_CHECK_MS, type UpdateSource } from "../src/main/updates.ts";
import {
  releaseUrl,
  type UpdateChannel,
  type UpdateMode,
  updateMode,
  type UpdateState,
} from "../src/shared/updates.ts";

/** A source with scripted answers that records what it was asked. */
function fakeSource(found: Record<UpdateChannel, string | null>) {
  const calls: string[] = [];
  const source: UpdateSource = {
    async check(channel) {
      calls.push(`check:${channel}`);
      const version = found[channel];
      return version === null ? null : { version };
    },
    async download() {
      calls.push("download");
    },
  };
  return { source, calls, failWith: (message: string) => (source.check = () => Promise.reject(new Error(message))) };
}

function setup(
  mode: UpdateMode,
  found: Record<UpdateChannel, string | null> = { latest: "2.0.0", beta: "2.1.0-beta.1" },
) {
  const fake = fakeSource(found);
  let clock = Date.parse("2026-10-21T10:00:00Z");
  const saved: { channel: UpdateChannel; lastCheck: string | null } = { channel: "latest", lastCheck: null };
  const states: UpdateState[] = [];
  const updater = createUpdater({
    source: fake.source,
    mode,
    version: "1.0.0",
    now: () => clock,
    saved: {
      channel: () => saved.channel,
      lastCheck: () => saved.lastCheck,
      setChannel: (channel) => void (saved.channel = channel),
      setLastCheck: (iso) => void (saved.lastCheck = iso),
    },
    onChange: (state) => states.push(state),
  });
  return { ...fake, updater, source: fake.source, saved, states, advance: (ms: number) => void (clock += ms) };
}

describe("update mode by platform", () => {
  const packaged = { packaged: true };
  it("updates itself on Windows and on an AppImage", () => {
    expect(updateMode({ ...packaged, platform: "win32", appImage: false })).toBe("auto");
    expect(updateMode({ ...packaged, platform: "linux", appImage: true })).toBe("auto");
  });
  it("only notifies on macOS and on a deb install", () => {
    expect(updateMode({ ...packaged, platform: "darwin", appImage: false })).toBe("notify");
    expect(updateMode({ ...packaged, platform: "linux", appImage: false })).toBe("notify");
  });
  it("does nothing when not running from an installer", () => {
    expect(updateMode({ packaged: false, platform: "win32", appImage: false })).toBe("off");
  });
});

describe("checking for updates", () => {
  it("downloads a found update in the background and reports it ready for the next quit", async () => {
    const { updater, calls } = setup("auto");
    await updater.checkNow();
    expect(calls).toEqual(["check:latest", "download"]);
    expect(updater.state().status).toEqual({ kind: "ready", version: "2.0.0" });
  });

  it("shows downloading while the download runs", async () => {
    const { updater, states } = setup("auto");
    await updater.checkNow();
    expect(states.map((s) => s.status.kind)).toEqual(["checking", "downloading", "ready"]);
  });

  it("downloads nothing on a notify-only platform and links the release", async () => {
    const { updater, calls } = setup("notify");
    await updater.checkNow();
    expect(calls).toEqual(["check:latest"]);
    expect(updater.state().status).toEqual({ kind: "available", version: "2.0.0", url: releaseUrl("2.0.0") });
  });

  it("checks and downloads nothing when updates are off", async () => {
    const { updater, calls } = setup("off");
    await updater.checkNow();
    await updater.automatic();
    expect(calls).toEqual([]);
    expect(updater.state().status).toEqual({ kind: "idle" });
  });

  it("says it is up to date when nothing newer is found", async () => {
    const { updater, calls } = setup("auto", { latest: null, beta: null });
    await updater.checkNow();
    expect(calls).toEqual(["check:latest"]);
    expect(updater.state().status).toEqual({ kind: "up-to-date" });
  });

  it("records the time of every check", async () => {
    const { updater, saved } = setup("auto");
    await updater.checkNow();
    expect(saved.lastCheck).toBe("2026-10-21T10:00:00.000Z");
    expect(updater.state().lastCheck).toBe("2026-10-21T10:00:00.000Z");
  });

  it("does not start a second check while one runs", async () => {
    const { updater, calls } = setup("auto");
    await Promise.all([updater.checkNow(), updater.checkNow()]);
    expect(calls.filter((c) => c.startsWith("check"))).toHaveLength(1);
  });

  it("reports a failed check quietly and still counts it as a check", async () => {
    const { updater, failWith, saved } = setup("auto");
    failWith("offline");
    await updater.checkNow();
    expect(updater.state().status).toEqual({ kind: "failed", message: "offline" });
    expect(saved.lastCheck).not.toBeNull();
  });

  it("reports a failed download without a ready update", async () => {
    const { updater, source } = setup("auto");
    source.download = () => Promise.reject(new Error("disk full"));
    await updater.checkNow();
    expect(updater.state().status).toEqual({ kind: "failed", message: "disk full" });
  });
});

describe("the daily limit", () => {
  it("checks automatically when it never has", async () => {
    const { updater, calls } = setup("auto");
    await updater.automatic();
    expect(calls).toContain("check:latest");
  });

  it("checks automatically at most once a day", async () => {
    const { updater, calls, advance } = setup("auto", { latest: null, beta: null });
    await updater.automatic();
    advance(DAILY_CHECK_MS - 1);
    await updater.automatic();
    expect(calls).toEqual(["check:latest"]);
    advance(1);
    await updater.automatic();
    expect(calls).toEqual(["check:latest", "check:latest"]);
  });

  it("counts a manual check toward the day", async () => {
    const { updater, calls } = setup("auto", { latest: null, beta: null });
    await updater.checkNow();
    await updater.automatic();
    expect(calls).toEqual(["check:latest"]);
  });

  it("lets a manual check through whenever asked", async () => {
    const { updater, calls } = setup("auto", { latest: null, beta: null });
    await updater.checkNow();
    await updater.checkNow();
    expect(calls).toEqual(["check:latest", "check:latest"]);
  });

  it("keeps a downloaded update instead of fetching it again", async () => {
    const { updater, calls, advance } = setup("auto");
    await updater.checkNow();
    advance(DAILY_CHECK_MS);
    await updater.automatic();
    expect(calls).toEqual(["check:latest", "download"]);
  });
});

describe("channels", () => {
  it("considers the releases of the chosen channel", async () => {
    const { updater, calls } = setup("auto");
    await updater.setChannel("beta");
    expect(calls[0]).toBe("check:beta");
    expect(updater.state().channel).toBe("beta");
    expect(updater.state().status).toEqual({ kind: "ready", version: "2.1.0-beta.1" });
  });

  it("remembers the channel and starts on latest", () => {
    const { updater, saved } = setup("auto");
    expect(updater.state().channel).toBe("latest");
    void updater.setChannel("beta");
    expect(saved.channel).toBe("beta");
  });

  it("checks right after a switch, whatever the daily limit says", async () => {
    const { updater, calls } = setup("auto", { latest: null, beta: null });
    await updater.checkNow();
    await updater.setChannel("beta");
    expect(calls).toEqual(["check:latest", "check:beta"]);
  });

  it("reports the new channel even when updates are off and nothing is checked", async () => {
    const { updater, calls, states } = setup("off");
    await updater.setChannel("beta");
    expect(calls).toEqual([]);
    expect(states.at(-1)?.channel).toBe("beta");
  });

  it("changes nothing when the channel is already chosen", async () => {
    const { updater, calls } = setup("auto");
    await updater.setChannel("latest");
    expect(calls).toEqual([]);
  });
});
