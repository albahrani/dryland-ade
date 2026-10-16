import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createUiStateStore } from "../src/main/ui-state.ts";

const stateFile = () => join(mkdtempSync(join(tmpdir(), "dryland-ui-")), "nested", "ui-state.json");

/** Auto-commit on everywhere, and every confirmation asked. */
const SETTINGS_DEFAULTS = {
  autoCommit: true,
  projectAutoCommit: {},
  dontAsk: { "tracker-metadata": false, "user-config": false, "prose-annotation": false },
  stopConfirmation: "busy-or-unseen",
};

describe("ui state store", () => {
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
    const saved = { grouping: "agent" as const, collapsed: { hidden: true, open: false }, hiddenShare: 0.3 };
    createUiStateStore(file).update({ sessionsLayout: { "/repos/shop": saved } });
    expect(createUiStateStore(file).read().sessionsLayout).toEqual({ "/repos/shop": saved });

    writeFileSync(file, JSON.stringify({ sessionsLayout: { "/repos/shop": saved, "/repos/bad": 7 } }));
    expect(createUiStateStore(file).read().sessionsLayout["/repos/bad"]).toEqual({
      grouping: "map",
      collapsed: { hidden: false, open: false },
      hiddenShare: 0.5,
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
});
