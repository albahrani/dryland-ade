import type { SessionState, TicketsTree, TreeTicket } from "@dryland/core";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SESSIONS_LAYOUT,
  groupCount,
  groupSessions,
  parseSessionsLayout,
  selectedSession,
  sessionCounts,
  sessionItemTitle,
  shortAge,
  splitSessions,
  trackStateSince,
  UNLINKED,
} from "../src/shared/sessions-view.ts";

const session = (id: string, on: string | null, startedAt = "2026-10-16T10:00:00.000Z", agent = "Claude Code") => {
  const [map = null, number] = on === null ? [] : on.split("/");
  return {
    id,
    terminalId: `t-${id}`,
    agent: { name: agent },
    ticket: map !== null && number !== undefined ? { map, id: number } : null,
    map,
    startedAt,
  };
};

describe("splitting sessions into the Hidden and Open panes", () => {
  it("puts live sessions without a tab in Hidden, every session with a tab in Open, waiting first", () => {
    const states: Record<string, SessionState> = { a: "idle", b: "waiting", c: "ended", d: "ended" };
    const sessions = [session("a", "shop/02"), session("b", "shop/03"), session("c", "shop/04"), session("d", null)];

    const { hidden, open } = splitSessions(sessions, states, [
      { kind: "terminal", id: "t-d" },
      { kind: "ticket", map: "shop", id: "02" },
    ]);

    expect(hidden.map((s) => s.id)).toEqual(["b", "a"]);
    expect(open.map((s) => s.id)).toEqual(["d"]);
  });
});

describe("the Hidden tree's groups", () => {
  const sessions = [
    session("1", "shop/02"),
    session("2", "cart/05"),
    session("3", null),
    session("4", "shop/03", "2026-10-16T11:00:00.000Z", "Copilot CLI"),
  ];

  it("groups by map with waiting groups first and Unlinked last, even when it waits", () => {
    const groups = groupSessions(sessions, { 3: "waiting", 4: "waiting", 1: "running" }, "map");

    expect(groups.map((g) => g.key)).toEqual(["shop", "cart", UNLINKED]);
    expect(groups[0]?.sessions.map((s) => s.id)).toEqual(["4", "1"]);
    expect(groups[0]?.breakdown).toBe("1 waiting for you, 1 working");
    expect(groupCount(groups[0]!)).toBe("(1/2)");
    expect(groupCount(groups[1]!)).toBe("(1)");
  });

  it("groups by agent, or puts every session in one group", () => {
    expect(groupSessions(sessions, {}, "agent").map((g) => g.key)).toEqual(["Claude Code", "Copilot CLI"]);
    const [flat, ...rest] = groupSessions(sessions, {}, "none");
    expect(rest).toEqual([]);
    expect(flat?.sessions.map((s) => s.id)).toEqual(["4", "1", "2", "3"]);
  });
});

describe("a session row's title", () => {
  it("is its ticket's title, its map's title, or New map", () => {
    const ticket = { id: "02", title: "Grill the cart" } as TreeTicket;
    const tree = {
      maps: [{ name: "shop", title: "Shop", fog: [], planning: [ticket], implementation: [], done: [] }],
    } as TicketsTree;

    expect(sessionItemTitle(tree, session("a", "shop/02"))).toBe("Grill the cart");
    expect(sessionItemTitle(tree, { ticket: null, map: "shop" })).toBe("Shop");
    expect(sessionItemTitle(tree, session("b", "shop/09"))).toBe("shop/09");
    expect(sessionItemTitle(null, session("c", null))).toBe("New map");
  });
});

describe("the status bar", () => {
  it("counts open and hidden sessions, naming the hidden waiting ones only when there are some", () => {
    const hidden = [session("a", "shop/02"), session("b", "shop/03")];
    expect(sessionCounts(hidden, [session("c", null)], { a: "waiting" })).toBe("1 open · 2 hidden (1 waiting)");
    expect(sessionCounts([], [], {})).toBe("0 open · 0 hidden");
  });

  it("shows the focused session tab's session, or the live session of the ticket or map in view", () => {
    const sessions = [session("old", "shop/02"), session("new", "shop/02"), session("map", null)];
    const mapSession = { ...sessions[2]!, map: "shop" };
    const all = [...sessions.slice(0, 2), mapSession];
    const states: Record<string, SessionState> = { old: "waiting", new: "ended", map: "idle" };

    expect(selectedSession({ kind: "terminal", id: "t-new" }, all, states)?.id).toBe("new");
    expect(selectedSession({ kind: "ticket", map: "shop", id: "02" }, all, states)?.id).toBe("old");
    expect(selectedSession({ kind: "map", name: "shop" }, all, states)?.id).toBe("map");
    expect(selectedSession({ kind: "ticket", map: "shop", id: "09" }, all, states)).toBeUndefined();
    expect(selectedSession(undefined, all, states)).toBeUndefined();
  });
});

describe("a session's age in its state", () => {
  it("counts from its start when first seen and from the change after that", () => {
    const s = session("a", "shop/02", "2026-10-16T10:00:00.000Z");
    const started = Date.parse(s.startedAt);
    const first = trackStateSince(new Map(), [s], { a: "running" }, started + 60_000);
    expect(first.get("a")).toEqual({ state: "running", since: started });
    expect(trackStateSince(first, [s], { a: "running" }, started + 90_000)).toBe(first);
    expect(trackStateSince(first, [s], { a: "waiting" }, started + 90_000).get("a")?.since).toBe(started + 90_000);
  });

  it("reads short", () => {
    expect([0, 30, 300, 7200, 172800].map((s) => shortAge(0, s * 1000))).toEqual(["now", "30s", "5m", "2h", "2d"]);
  });
});

describe("the saved Sessions layout", () => {
  it("keeps what is readable and defaults the rest", () => {
    expect(parseSessionsLayout(null)).toEqual(DEFAULT_SESSIONS_LAYOUT);
    expect(parseSessionsLayout({ grouping: "agent", collapsed: { open: true }, hiddenShare: 2 })).toEqual({
      grouping: "agent",
      collapsed: { hidden: false, open: true },
      hiddenShare: 0.9,
    });
    expect(parseSessionsLayout({ grouping: "state", hiddenShare: "x" })).toEqual(DEFAULT_SESSIONS_LAYOUT);
  });
});
