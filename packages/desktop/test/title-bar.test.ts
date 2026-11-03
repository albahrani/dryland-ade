import { describe, expect, it } from "vitest";
import { TITLE_BAR_HEIGHT, hasCustomTitleBar, titleBarWindowOptions } from "../src/shared/title-bar.ts";

describe("the title bar", () => {
  it("is 36 px tall", () => {
    expect(TITLE_BAR_HEIGHT).toBe(36);
  });

  it("is custom on Windows and Linux, with the system's window controls drawn over it", () => {
    for (const platform of ["win32", "linux"]) {
      expect(hasCustomTitleBar(platform)).toBe(true);
      const options = titleBarWindowOptions(platform);
      expect(options.titleBarStyle).toBe("hidden");
      expect(options.titleBarOverlay).toMatchObject({ height: 36 });
    }
  });

  it("is left to macOS, which keeps its native menu bar and window frame", () => {
    expect(hasCustomTitleBar("darwin")).toBe(false);
    expect(titleBarWindowOptions("darwin")).toEqual({});
  });
});
