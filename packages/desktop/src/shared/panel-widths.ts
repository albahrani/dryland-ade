/** The widths, in pixels, of the left (tickets) and right (files) side panels. */
export interface PanelWidths {
  left: number;
  right: number;
}

export type PanelSide = keyof PanelWidths;

export const DEFAULT_PANEL_WIDTHS: PanelWidths = { left: 320, right: 240 };

/** The narrowest and widest each panel may be dragged. */
export const PANEL_WIDTH_LIMITS: Record<PanelSide, { min: number; max: number }> = {
  left: { min: 200, max: 640 },
  right: { min: 160, max: 560 },
};

export function clampPanelWidth(side: PanelSide, width: number): number {
  const { min, max } = PANEL_WIDTH_LIMITS[side];
  return Math.min(max, Math.max(min, Math.round(width)));
}

/** Reads each width on its own, so one wrong value never discards the other. */
export function parsePanelWidths(raw: unknown): PanelWidths {
  const r = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const read = (side: PanelSide): number =>
    typeof r[side] === "number" && Number.isFinite(r[side])
      ? clampPanelWidth(side, r[side])
      : DEFAULT_PANEL_WIDTHS[side];
  return { left: read("left"), right: read("right") };
}
