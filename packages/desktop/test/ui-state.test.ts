import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createUiStateStore } from "../src/main/ui-state.ts";

const stateFile = () => join(mkdtempSync(join(tmpdir(), "dryland-ui-")), "nested", "ui-state.json");

describe("ui state store", () => {
  it("starts with no project and the legend showing", () => {
    expect(createUiStateStore(stateFile()).read()).toEqual({ lastProject: null, legendDismissed: false, tabs: {} });
  });

  it("remembers the last project and the dismissed legend across restarts", () => {
    const file = stateFile();
    const first = createUiStateStore(file);
    first.update({ lastProject: "/repos/shop" });
    first.update({ legendDismissed: true });

    expect(createUiStateStore(file).read()).toEqual({ lastProject: "/repos/shop", legendDismissed: true, tabs: {} });
  });

  it("falls back to defaults when the file is corrupt or holds the wrong shapes", () => {
    const file = stateFile();
    createUiStateStore(file).update({ legendDismissed: true });
    writeFileSync(file, "{ not json");
    expect(createUiStateStore(file).read()).toEqual({ lastProject: null, legendDismissed: false, tabs: {} });

    writeFileSync(file, JSON.stringify({ lastProject: 7, legendDismissed: "yes" }));
    expect(createUiStateStore(file).read()).toEqual({ lastProject: null, legendDismissed: false, tabs: {} });
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
});
