import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_PANEL_FOLDED, DEFAULT_PANEL_WIDTHS } from "../src/shared/panel-widths.ts";
import { createUiStateStore } from "../src/main/ui-state.ts";

const stateFile = () => join(mkdtempSync(join(tmpdir(), "dryland-ui-")), "nested", "ui-state.json");

/** Every confirmation asked. */
const SETTINGS_DEFAULTS = {
  dontAsk: { "tracker-metadata": false, "user-config": false },
  stopConfirmation: "busy-or-unseen",
  resumeOnStart: false,
  sessionRetentionDays: 30,
  updateChannel: "latest",
  lastUpdateCheck: null,
  openProjects: [] as string[],
  panelWidths: DEFAULT_PANEL_WIDTHS,
  panelFolded: DEFAULT_PANEL_FOLDED,
};

describe("ui state store", () => {
  it("remembers the open projects across restarts, dropping what is not a path", () => {
    const file = stateFile();
    createUiStateStore(file).update({ openProjects: ["/repos/shop", "/repos/blog"] });
    expect(createUiStateStore(file).read().openProjects).toEqual(["/repos/shop", "/repos/blog"]);

    writeFileSync(file, JSON.stringify({ openProjects: ["/repos/shop", 4, "/repos/shop"] }));
    expect(createUiStateStore(file).read().openProjects).toEqual(["/repos/shop"]);
  });

  it("starts with no project and the legend showing", () => {
    expect(createUiStateStore(stateFile()).read()).toEqual({
      lastProject: null,
      legendDismissed: false,
      tabs: {},
      sessionsLayout: {},
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
      ...SETTINGS_DEFAULTS,
    });

    writeFileSync(file, JSON.stringify({ lastProject: 7, legendDismissed: "yes" }));
    expect(createUiStateStore(file).read()).toEqual({
      lastProject: null,
      legendDismissed: false,
      tabs: {},
      sessionsLayout: {},
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

  it("remembers the side panel widths and clamps a saved one that is out of range", () => {
    const file = stateFile();
    createUiStateStore(file).update({ panelWidths: { left: 400, right: 300 } });
    expect(createUiStateStore(file).read().panelWidths).toEqual({ left: 400, right: 300 });

    writeFileSync(file, JSON.stringify({ panelWidths: { left: 5, right: "x" } }));
    expect(createUiStateStore(file).read().panelWidths).toEqual({ left: 200, right: 240 });
  });

  it("remembers which side panels are folded", () => {
    const file = stateFile();
    createUiStateStore(file).update({ panelFolded: { left: true, right: false } });
    expect(createUiStateStore(file).read().panelFolded).toEqual({ left: true, right: false });
  });

  it("remembers each confirmation type's 'do not ask again' on its own, and its reset", () => {
    const file = stateFile();
    const store = createUiStateStore(file);
    store.update({ dontAsk: { ...store.read().dontAsk, "tracker-metadata": true } });
    expect(createUiStateStore(file).read().dontAsk).toEqual({
      "tracker-metadata": true,
      "user-config": false,
    });

    writeFileSync(file, JSON.stringify({ dontAsk: { "tracker-metadata": "yes", "user-config": true, other: true } }));
    expect(createUiStateStore(file).read().dontAsk).toEqual({
      "tracker-metadata": false,
      "user-config": true,
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

  it("drops the settings of the removed tracker paths when it reads an older file", () => {
    const file = stateFile();
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(
      file,
      JSON.stringify({
        autoCommit: false,
        projectAutoCommit: { "/repos/shop": true },
        compat: { "/repos/shop": { acceptedDeviations: "d1", overrides: [] } },
        dontAsk: { "tracker-metadata": true, "prose-annotation": true },
      }),
    );

    const read = createUiStateStore(file).read();

    expect(read).toEqual({
      lastProject: null,
      legendDismissed: false,
      tabs: {},
      sessionsLayout: {},
      ...SETTINGS_DEFAULTS,
      dontAsk: { "tracker-metadata": true, "user-config": false },
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
