import { describe, expect, it } from "vitest";
import { clampPanelWidth, DEFAULT_PANEL_WIDTHS, PANEL_WIDTH_LIMITS, parsePanelWidths } from "../src/shared/panel-widths.ts";

describe("panel widths", () => {
  it("keeps a dragged width between the minimum and maximum", () => {
    expect(clampPanelWidth("left", 10)).toBe(PANEL_WIDTH_LIMITS.left.min);
    expect(clampPanelWidth("left", 5000)).toBe(PANEL_WIDTH_LIMITS.left.max);
    expect(clampPanelWidth("right", 301.6)).toBe(302);
  });

  it("reads each saved width on its own, falling back to the default for a wrong one", () => {
    expect(parsePanelWidths({ left: 400, right: 300 })).toEqual({ left: 400, right: 300 });
    expect(parsePanelWidths({ left: "wide", right: 300 })).toEqual({ left: DEFAULT_PANEL_WIDTHS.left, right: 300 });
    expect(parsePanelWidths({ left: 1, right: 99999 })).toEqual({
      left: PANEL_WIDTH_LIMITS.left.min,
      right: PANEL_WIDTH_LIMITS.right.max,
    });
    expect(parsePanelWidths(null)).toEqual(DEFAULT_PANEL_WIDTHS);
  });
});
