import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createUiStateStore } from "../src/main/ui-state.ts";

const stateFile = () => join(mkdtempSync(join(tmpdir(), "dryland-ui-")), "nested", "ui-state.json");

describe("ui state store", () => {
  it("starts with no project and the legend showing", () => {
    expect(createUiStateStore(stateFile()).read()).toEqual({ lastProject: null, legendDismissed: false });
  });

  it("remembers the last project and the dismissed legend across restarts", () => {
    const file = stateFile();
    const first = createUiStateStore(file);
    first.update({ lastProject: "/repos/shop" });
    first.update({ legendDismissed: true });

    expect(createUiStateStore(file).read()).toEqual({ lastProject: "/repos/shop", legendDismissed: true });
  });

  it("falls back to defaults when the file is corrupt or holds the wrong shapes", () => {
    const file = stateFile();
    createUiStateStore(file).update({ legendDismissed: true });
    writeFileSync(file, "{ not json");
    expect(createUiStateStore(file).read()).toEqual({ lastProject: null, legendDismissed: false });

    writeFileSync(file, JSON.stringify({ lastProject: 7, legendDismissed: "yes" }));
    expect(createUiStateStore(file).read()).toEqual({ lastProject: null, legendDismissed: false });
  });
});
