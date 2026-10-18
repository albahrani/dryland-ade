import type { PausedWas, SessionState, TicketsTree, TreeTicket } from "@dryland/core";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SESSIONS_LAYOUT,
  dragSash,
  groupCount,
  groupPaused,
  groupSessions,
  mapCountsLabel,
  mapSessionCounts,
  pausedItems,
  pausedPill,
  pausedTotals,
  parseSessionsLayout,
  selectedSession,
  sessionCounts,
  sessionItemTitle,
  shortAge,
  splitSessions,
  trackStateSince,
  UNLINKED,
} from "../src/shared/sessions-view.ts";
import type { PausedSession } from "../src/shared/paused-session.ts";

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
    expect(sessionCounts(hidden, [], {}, 3)).toBe("0 open · 2 hidden · 3 paused");
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
    expect(
      parseSessionsLayout({
        grouping: "agent",
        collapsed: { open: true },
        shares: { hidden: 1, paused: 2, open: 3 },
      }),
    ).toEqual({
      grouping: "agent",
      collapsed: { hidden: false, paused: false, open: true },
      shares: { hidden: 1, paused: 2, open: 3 },
    });
    expect(parseSessionsLayout({ grouping: "state", shares: { hidden: 1 } })).toEqual(DEFAULT_SESSIONS_LAYOUT);
  });

  it("migrates the single sash of the two-pane layout, keeping Hidden's share of Hidden and Open", () => {
    const { shares } = parseSessionsLayout({ grouping: "agent", collapsed: { hidden: true }, hiddenShare: 0.3 });
    expect(shares.hidden / (shares.hidden + shares.open)).toBeCloseTo(0.3);
    expect(shares.paused).toBeGreaterThan(0);
    expect(parseSessionsLayout({ hiddenShare: 2 }).shares.hidden).toBeGreaterThan(
      parseSessionsLayout({ hiddenShare: 0.5 }).shares.hidden,
    );
  });
});

describe("dragging a sash", () => {
  const shares = { hidden: 0.3, paused: 0.3, open: 0.4 };
  const none = { hidden: false, paused: false, open: false };

  it("moves the boundary between a pane and the next expanded one and leaves the rest", () => {
    const moved = dragSash(shares, none, "hidden", 0.5);
    expect(moved.hidden).toBeCloseTo(0.5);
    expect(moved.paused).toBeCloseTo(0.1);
    expect(moved.open).toBe(0.4);

    const lower = dragSash(shares, none, "paused", 0.5);
    expect(lower.hidden).toBe(0.3);
    expect(lower.paused).toBeCloseTo(0.2);
    expect(lower.open).toBeCloseTo(0.5);
  });

  it("skips a collapsed pane and keeps both neighbours off the edges", () => {
    const skipped = dragSash(shares, { ...none, paused: true }, "hidden", 0.5);
    expect(skipped.hidden / (skipped.hidden + skipped.open)).toBeCloseTo(0.5);
    expect(skipped.paused).toBe(0.3);

    const pinned = dragSash(shares, none, "hidden", 5);
    expect(pinned.hidden).toBeCloseTo(0.5);
    expect(pinned.paused).toBeCloseTo(0.1);
    expect(dragSash(shares, none, "open", 0.5)).toBe(shares);
  });
});

describe("the paused sessions in the Sessions view", () => {
  const paused = (agent: string, was: PausedWas, lastSeen: string): PausedSession => ({
    sessionId: "c",
    agentId: "a",
    agent,
    resumeCommand: null,
    was,
    lastSeen,
    branch: null,
  });
  const claims = {
    "shop/02": paused("Claude Code", null, "2026-10-18T09:00:00Z"),
    "shop/03": paused("Claude Code", "waiting", "2026-10-18T08:00:00Z"),
    "blog/01": paused("Copilot CLI", "interrupted", "2026-10-18T10:00:00Z"),
    "blog/02": paused("Copilot CLI", null, "2026-10-18T07:00:00Z"),
  };

  it("lists each as a session-like item on its ticket and map", () => {
    const [first] = pausedItems(claims);
    expect(first).toMatchObject({
      id: "shop/02",
      ticket: { map: "shop", id: "02" },
      map: "shop",
      agent: { name: "Claude Code" },
    });
    expect(pausedItems(claims)).toHaveLength(4);
  });

  it("groups them like Hidden, was-waiting first, with the was-waiting count", () => {
    const groups = groupPaused(pausedItems(claims), "map");

    expect(groups.map((g) => g.key)).toEqual(["shop", "blog"]);
    expect(groups[0]?.sessions.map((s) => s.id)).toEqual(["shop/03", "shop/02"]);
    expect(groups[0]?.waiting).toBe(1);
    expect(groupCount(groups[0]!)).toBe("(1/2)");
    expect(groups[1]?.breakdown).toBe("1 interrupted, 1 paused");
    expect(groupPaused(pausedItems(claims), "agent").map((g) => g.key)).toEqual(["Claude Code", "Copilot CLI"]);
  });

  it("labels a row's pill by what the session was doing", () => {
    expect(["waiting", "interrupted", null].map((was) => pausedPill(was as PausedWas))).toEqual([
      "was waiting",
      "interrupted",
      "paused",
    ]);
  });

  it("counts was-waiting before the total for the header badge", () => {
    expect(pausedTotals(pausedItems(claims))).toEqual({ waiting: 1, total: 4 });
  });
});

describe("a map's session counts", () => {
  const live = [session("a", "shop/02"), session("b", "shop/03"), session("c", "blog/01")];
  const states: Record<string, SessionState> = { a: "waiting", b: "running", c: "waiting" };
  const claims = { "shop/04": { was: "waiting" }, "shop/05": { was: null }, "blog/02": { was: "interrupted" } };

  it("are its waiting live sessions and its paused ones, with the breakdown for a tooltip", () => {
    const counts = mapSessionCounts("shop", live, states, claims as never, [{ kind: "terminal", id: "t-b" }]);
    expect(counts).toEqual({ open: 1, hidden: 1, hiddenWaiting: 1, waiting: 1, paused: 2, pausedWaiting: 1 });
    expect(mapCountsLabel(counts)).toBe("1 waiting for you, 2 paused (1 was waiting)");
    expect(mapCountsLabel({ open: 0, hidden: 0, hiddenWaiting: 0, waiting: 0, paused: 0, pausedWaiting: 0 })).toBe("");
  });
});
