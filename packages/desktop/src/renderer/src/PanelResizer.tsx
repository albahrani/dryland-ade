import { type KeyboardEvent, type PointerEvent, useRef } from "react";
import { clampPanelWidth, type PanelSide } from "../../shared/panel-widths.ts";

const KEY_STEP = 16;

/** A drag handle on the inner edge of a side panel; arrow keys resize it too. */
export function PanelResizer({
  side,
  width,
  onResize,
  onCommit,
}: {
  side: PanelSide;
  width: number;
  /** Called on every move with the clamped width. */
  onResize: (width: number) => void;
  /** Called once the drag or key press ends, with the final width. */
  onCommit: (width: number) => void;
}) {
  const drag = useRef<{ startX: number; startWidth: number; width: number } | null>(null);
  // The left panel grows as the pointer moves right, the right panel as it moves left.
  const direction = side === "left" ? 1 : -1;

  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current === null) return;
    const next = clampPanelWidth(side, drag.current.startWidth + direction * (event.clientX - drag.current.startX));
    drag.current.width = next;
    onResize(next);
  };
  const end = () => {
    if (drag.current === null) return;
    const { width: final } = drag.current;
    drag.current = null;
    onCommit(final);
  };
  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = (event.key === "ArrowRight" ? 1 : -1) * direction * KEY_STEP;
    const next = clampPanelWidth(side, width + delta);
    onResize(next);
    onCommit(next);
  };

  return (
    <div
      className={`panel-resizer panel-resizer-${side}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${side} panel`}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { startX: event.clientX, startWidth: width, width };
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={key}
    />
  );
}
