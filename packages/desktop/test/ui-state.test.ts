import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_PANEL_WIDTHS } from "../src/shared/panel-widths.ts";
import { createUiStateStore } from "../src/main/ui-state.ts";

const stateFile = () => join(mkdtempSync(join(tmpdir(), "dryland-ui-")), "nested", "ui-state.json");

/** Auto-commit on everywhere, and every confirmation asked. */
const SETTINGS_DEFAULTS = {
  autoCommit: true,
  projectAutoCommit: {},
  autoSubmit: false,
  projectAutoSubmit: {},
  dontAsk: { "tracker-metadata": false, "user-config": false, "prose-annotation": false },
  stopConfirmation: "busy-or-unseen",
  resumeOnStart: false,
  compat: {},
  sessionRetentionDays: 30,
  updateChannel: "latest",
  lastUpdateCheck: null,
  openProjects: [] as string[],
  panelWidths: DEFAULT_PANEL_WIDTHS,
};

describe("ui state store", () => {
  it("remembers the open projects across restarts, dropping what is not a path", () => {
    const file = stateFile();
    createUiStateStore(file).update({ openProjects: ["/repos/shop", "/repos/blog"] });
    expect(createUiStateStore(file).read().openProjects).toEqual(["/repos/shop", "/repos/blog"]);

    writeFileSync(file, JSON.stringify({ openProjects: ["/repos/shop", 4, "/repos/shop"] }));
    expect(createUiStateStore(file).read().openProjects).toEqual(["/repos/shop"]);
  });

  it("keeps the compatibility decisions per project, dropping what is not an id", () => {
    const file = stateFile();
    createUiStateStore(file).update({ compat: { "/repos/shop": { acceptedDeviations: "d1", overrides: ["retro"] } } });
    expect(createUiStateStore(file).read().compat).toEqual({
      "/repos/shop": { acceptedDeviations: "d1", overrides: ["retro"] },
    });

    writeFileSync(
      file,
      JSON.stringify({ compat: { "/repos/shop": { acceptedDeviations: 4, overrides: ["retro", 7] } } }),
    );
    expect(createUiStateStore(file).read().compat).toEqual({
      "/repos/shop": { acceptedDeviations: null, overrides: ["retro"] },
    });
  });

  it("starts with no project and the legend showing", () => {
    expect(createUiStateStore(stateFile()).read()).toEqual({
      lastProject: null,
      legendDismissed: false,
      tabs: {},
      sessionsLayout: {},
      liveEventsPanel: "expanded",
      ...SETTINGS_DEFAULTS,
    });
  });

  it("remembers the last project and the dismissed legend across restarts", () => {
    const file = stateFile();
    const first = createUiStateStore(file);
    first.update({ lastProject: "/repos/shop" });
    first.update({ legendDismissed: true });

    expect(createUiStateStore(file).read()).toEqual({
      lastProject: "/repos/shop",
      legendDismissed: true,
      tabs: {},
      sessionsLayout: {},
      liveEventsPanel: "expanded",
      ...SETTINGS_DEFAULTS,
    });
  });

  it("falls back to defaults when the file is corrupt or holds the wrong shapes", () => {
    const file = stateFile();
    createUiStateStore(file).update({ legendDismissed: true });
    writeFileSync(file, "{ not json");
    expect(createUiStateStore(file).read()).toEqual({
      lastProject: null,
      legendDismissed: false,
      tabs: {},
      sessionsLayout: {},
      liveEventsPanel: "expanded",
      ...SETTINGS_DEFAULTS,
    });

    writeFileSync(file, JSON.stringify({ lastProject: 7, legendDismissed: "yes" }));
    expect(createUiStateStore(file).read()).toEqual({
      lastProject: null,
      legendDismissed: false,
      tabs: {},
      sessionsLayout: {},
      liveEventsPanel: "expanded",
      ...SETTINGS_DEFAULTS,
    });
  });

  it("remembers each project's open tabs and drops unreadable ones", () => {
    const file = stateFile();
    const saved = { open: [{ kind: "map" as const, name: "shop" }], active: "map:shop" };
    createUiStateStore(file).update({ tabs: { "/repos/shop": saved } });
    expect(createUiStateStore(file).read().tabs).toEqual({ "/repos/shop": saved });

    writeFileSync(file, JSON.stringify({ tabs: { "/repos/shop": saved, "/repos/bad": 7 } }));
    expect(createUiStateStore(file).read().tabs).toEqual({
      "/repos/shop": saved,
      "/repos/bad": { open: [], active: null },
    });
  });

  it("remembers each project's Sessions layout and repairs unreadable ones", () => {
    const file = stateFile();
    const saved = {
      grouping: "agent" as const,
      collapsed: { hidden: true, paused: false, open: false },
      shares: { hidden: 0.3, paused: 0.2, open: 0.5 },
    };
    createUiStateStore(file).update({ sessionsLayout: { "/repos/shop": saved } });
    expect(createUiStateStore(file).read().sessionsLayout).toEqual({ "/repos/shop": saved });

    writeFileSync(file, JSON.stringify({ sessionsLayout: { "/repos/shop": saved, "/repos/bad": 7 } }));
    expect(createUiStateStore(file).read().sessionsLayout["/repos/bad"]).toEqual({
      grouping: "map",
      collapsed: { hidden: false, paused: false, open: false },
      shares: { hidden: 0.35, paused: 0.25, open: 0.4 },
    });
  });

  it("remembers the live-events panel mode and falls back to expanded for an unknown one", () => {
    const file = stateFile();
    createUiStateStore(file).update({ liveEventsPanel: "line" });
    expect(createUiStateStore(file).read().liveEventsPanel).toBe("line");
    createUiStateStore(file).update({ liveEventsPanel: "hidden" });
    expect(createUiStateStore(file).read().liveEventsPanel).toBe("hidden");

    writeFileSync(file, JSON.stringify({ liveEventsPanel: "sideways" }));
    expect(createUiStateStore(file).read().liveEventsPanel).toBe("expanded");
  });

  it("remembers the side panel widths and clamps a saved one that is out of range", () => {
    const file = stateFile();
    createUiStateStore(file).update({ panelWidths: { left: 400, right: 300 } });
    expect(createUiStateStore(file).read().panelWidths).toEqual({ left: 400, right: 300 });

    writeFileSync(file, JSON.stringify({ panelWidths: { left: 5, right: "x" } }));
    expect(createUiStateStore(file).read().panelWidths).toEqual({ left: 200, right: 240 });
  });

  it("remembers each confirmation type's 'do not ask again' on its own, and its reset", () => {
    const file = stateFile();
    const store = createUiStateStore(file);
    store.update({ dontAsk: { ...store.read().dontAsk, "tracker-metadata": true } });
    expect(createUiStateStore(file).read().dontAsk).toEqual({
      "tracker-metadata": true,
      "user-config": false,
      "prose-annotation": false,
    });

    writeFileSync(file, JSON.stringify({ dontAsk: { "tracker-metadata": "yes", "user-config": true, other: true } }));
    expect(createUiStateStore(file).read().dontAsk).toEqual({
      "tracker-metadata": false,
      "user-config": true,
      "prose-annotation": false,
    });
  });

  it("remembers when stopping a session asks, falling back to the default for an unknown rule", () => {
    const file = stateFile();
    createUiStateStore(file).update({ stopConfirmation: "never" });
    expect(createUiStateStore(file).read().stopConfirmation).toBe("never");

    writeFileSync(file, JSON.stringify({ stopConfirmation: "sometimes" }));
    expect(createUiStateStore(file).read().stopConfirmation).toBe("busy-or-unseen");
  });

  it("leaves resuming sessions on start off until it is turned on, and remembers it", () => {
    const file = stateFile();
    expect(createUiStateStore(file).read().resumeOnStart).toBe(false);
    createUiStateStore(file).update({ resumeOnStart: true });
    expect(createUiStateStore(file).read().resumeOnStart).toBe(true);

    writeFileSync(file, JSON.stringify({ resumeOnStart: "yes" }));
    expect(createUiStateStore(file).read().resumeOnStart).toBe(false);
  });

  it("remembers the session retention period, falling back to 30 days for anything but a positive whole number", () => {
    const file = stateFile();
    createUiStateStore(file).update({ sessionRetentionDays: 7 });
    expect(createUiStateStore(file).read().sessionRetentionDays).toBe(7);

    for (const bad of [0, -1, 1.5, "7"]) {
      writeFileSync(file, JSON.stringify({ sessionRetentionDays: bad }));
      expect(createUiStateStore(file).read().sessionRetentionDays).toBe(30);
    }
  });

  it("remembers auto-commit globally and per project, dropping overrides that are not on or off", () => {
    const file = stateFile();
    createUiStateStore(file).update({ autoCommit: false, projectAutoCommit: { "/repos/shop": true } });
    expect(createUiStateStore(file).read()).toMatchObject({
      autoCommit: false,
      projectAutoCommit: { "/repos/shop": true },
    });

    writeFileSync(file, JSON.stringify({ autoCommit: "no", projectAutoCommit: { "/repos/shop": false, "/a": 1 } }));
    expect(createUiStateStore(file).read()).toMatchObject({
      autoCommit: true,
      projectAutoCommit: { "/repos/shop": false },
    });
  });

  it("remembers auto-submit globally and per project, off unless it was turned on", () => {
    const file = stateFile();
    expect(createUiStateStore(file).read()).toMatchObject({ autoSubmit: false, projectAutoSubmit: {} });
    createUiStateStore(file).update({ autoSubmit: true, projectAutoSubmit: { "/repos/shop": false } });
    expect(createUiStateStore(file).read()).toMatchObject({
      autoSubmit: true,
      projectAutoSubmit: { "/repos/shop": false },
    });

    writeFileSync(file, JSON.stringify({ autoSubmit: "yes", projectAutoSubmit: { "/repos/shop": true, "/a": 1 } }));
    expect(createUiStateStore(file).read()).toMatchObject({
      autoSubmit: false,
      projectAutoSubmit: { "/repos/shop": true },
    });
  });
});

describe("ui state update fields", () => {
  it("defaults to the latest channel and no check, and remembers both", () => {
    const file = stateFile();
    expect(createUiStateStore(file).read()).toMatchObject({ updateChannel: "latest", lastUpdateCheck: null });
    createUiStateStore(file).update({ updateChannel: "beta", lastUpdateCheck: "2026-10-21T10:00:00.000Z" });
    expect(createUiStateStore(file).read()).toMatchObject({
      updateChannel: "beta",
      lastUpdateCheck: "2026-10-21T10:00:00.000Z",
    });
  });

  it("falls back for a channel or time that is not valid", () => {
    const file = stateFile();
    createUiStateStore(file).update({});
    writeFileSync(file, JSON.stringify({ updateChannel: "nightly", lastUpdateCheck: "yesterday" }));
    expect(createUiStateStore(file).read()).toMatchObject({ updateChannel: "latest", lastUpdateCheck: null });
  });
});
