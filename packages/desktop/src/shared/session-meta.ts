import type { SessionState } from "@dryland/core";

/** The one place a session state gets its badge glyph and the words of its tooltip. */
export const SESSION_META: Record<SessionState, { label: string; badge: string }> = {
  launched: { label: "launched", badge: "•" },
  running: { label: "working", badge: "◠" },
  waiting: { label: "waiting for you", badge: "…" },
  idle: { label: "idle", badge: "–" },
  ended: { label: "ended", badge: "■" },
};
