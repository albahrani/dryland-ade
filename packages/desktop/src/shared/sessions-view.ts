import type { SessionState, TicketRef, TicketsTree } from "@dryland/core";
import { SESSION_META } from "./session-meta.ts";
import { type ItemRef, ticketKey } from "./tabs.ts";

/** How the Hidden pane groups its tree: by map (Unlinked last), by agent, or not at all. Never by state. */
export const SESSION_GROUPINGS = ["map", "agent", "none"] as const;
export type SessionGrouping = (typeof SESSION_GROUPINGS)[number];

/** The Sessions view's panes, top to bottom. */
export const SESSIONS_PANES = ["hidden", "open"] as const;
export type SessionsPane = (typeof SESSIONS_PANES)[number];

/** What the Sessions view remembers per project: its grouping, which panes are collapsed, and where the sash is. */
export interface SessionsLayout {
  grouping: SessionGrouping;
  collapsed: Record<SessionsPane, boolean>;
  /** The share of the panes' height Hidden takes while both are expanded, between 0.1 and 0.9. */
  hiddenShare: number;
}

export const DEFAULT_SESSIONS_LAYOUT: SessionsLayout = {
  grouping: "map",
  collapsed: { hidden: false, open: false },
  hiddenShare: 0.5,
};

/** Keeps the sash off the panes' edges, so neither pane can be dragged to nothing but its header. */
export const clampShare = (share: number): number => Math.min(0.9, Math.max(0.1, share));

/** Reads a saved layout defensively: each field on its own, anything unreadable falls back to its default. */
export function parseSessionsLayout(raw: unknown): SessionsLayout {
  const r = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const collapsed =
    r.collapsed !== null && typeof r.collapsed === "object" ? (r.collapsed as Record<string, unknown>) : {};
  return {
    grouping: SESSION_GROUPINGS.includes(r.grouping as SessionGrouping)
      ? (r.grouping as SessionGrouping)
      : DEFAULT_SESSIONS_LAYOUT.grouping,
    collapsed: { hidden: collapsed.hidden === true, open: collapsed.open === true },
    hiddenShare:
      typeof r.hiddenShare === "number" && Number.isFinite(r.hiddenShare)
        ? clampShare(r.hiddenShare)
        : DEFAULT_SESSIONS_LAYOUT.hiddenShare,
  };
}

/** What the Sessions view reads of a session. */
export interface ViewSession {
  id: string;
  terminalId: string;
  agent: { name: string };
  ticket: TicketRef | null;
  map: string | null;
  startedAt: string;
}

type States = Readonly<Record<string, SessionState>>;

const stateOf = (states: States, session: { id: string }): SessionState => states[session.id] ?? "launched";

/** The sessions that most need the user first, the newest of equals first. Returns a new array. */
export function waitingFirst<S extends ViewSession>(sessions: readonly S[], states: States): S[] {
  return [...sessions].sort(
    (a, b) =>
      SESSION_META[stateOf(states, a)].urgency - SESSION_META[stateOf(states, b)].urgency ||
      b.startedAt.localeCompare(a.startedAt),
  );
}

/** Hidden sessions: live ones with no open tab. Open sessions: those with a tab, ended or not. */
export function splitSessions<S extends ViewSession>(
  sessions: readonly S[],
  states: States,
  tabs: readonly ItemRef[],
): { hidden: S[]; open: S[] } {
  const withTab = new Set(tabs.flatMap((tab) => (tab.kind === "terminal" ? [tab.id] : [])));
  return {
    hidden: waitingFirst(
      sessions.filter((s) => !withTab.has(s.terminalId) && stateOf(states, s) !== "ended"),
      states,
    ),
    open: waitingFirst(
      sessions.filter((s) => withTab.has(s.terminalId)),
      states,
    ),
  };
}

/** A map's title, or its name when the tree does not hold it. */
export const mapTitle = (tree: TicketsTree | null, name: string): string =>
  tree?.maps.find((map) => map.name === name)?.title ?? name;

/**
 * The title of what a session works on: its ticket's, its map's, or "New map". A ticket the tree does not hold
 * reads as its `map/id`.
 */
export function sessionItemTitle(tree: TicketsTree | null, session: Pick<ViewSession, "ticket" | "map">): string {
  const { ticket } = session;
  if (ticket === null) return session.map === null ? "New map" : mapTitle(tree, session.map);
  const map = tree?.maps.find((m) => m.name === ticket.map);
  const found = map && [...map.planning, ...map.implementation, ...map.done].find((t) => t.id === ticket.id);
  return found?.title ?? ticketKey(ticket);
}

/** The label of the group of sessions on no map: a new map's, not yet charted. */
export const UNLINKED = "Unlinked";

export interface SessionGroup<S> {
  /** The map name, the agent name, or `UNLINKED`. */
  key: string;
  /** Waiting first. */
  sessions: S[];
  waiting: number;
  /** Every state the group holds with its count, most urgent first, as "1 waiting for you, 2 working". */
  breakdown: string;
}

/** How many sessions are in each state, most urgent first: "1 waiting for you, 2 working". */
export function stateBreakdown(sessions: readonly { id: string }[], states: States): string {
  const counts = new Map<SessionState, number>();
  for (const session of sessions) counts.set(stateOf(states, session), (counts.get(stateOf(states, session)) ?? 0) + 1);
  return [...counts]
    .sort(([a], [b]) => SESSION_META[a].urgency - SESSION_META[b].urgency)
    .map(([state, count]) => `${count} ${SESSION_META[state].label}`)
    .join(", ");
}

/** A group's count: `(waiting/total)`, or just `(total)` when none waits. */
export const groupCount = (group: { waiting: number; sessions: readonly unknown[] }): string =>
  group.waiting === 0 ? `(${group.sessions.length})` : `(${group.waiting}/${group.sessions.length})`;

/**
 * The Hidden tree's groups: groups with waiting sessions first, then by name, Unlinked last. `none` is one group
 * keyed "" holding every session.
 */
export function groupSessions<S extends ViewSession>(
  sessions: readonly S[],
  states: States,
  grouping: SessionGrouping,
): SessionGroup<S>[] {
  const keyOf = (s: S) => (grouping === "none" ? "" : grouping === "agent" ? s.agent.name : (s.map ?? UNLINKED));
  const byKey = new Map<string, S[]>();
  for (const session of sessions) byKey.set(keyOf(session), [...(byKey.get(keyOf(session)) ?? []), session]);
  const groups = [...byKey].map(([key, members]) => ({
    key,
    sessions: waitingFirst(members, states),
    waiting: members.filter((s) => stateOf(states, s) === "waiting").length,
    breakdown: stateBreakdown(members, states),
  }));
  const unlinkedLast = (g: SessionGroup<S>) => (grouping === "map" && g.key === UNLINKED ? 1 : 0);
  return groups.sort(
    (a, b) =>
      unlinkedLast(a) - unlinkedLast(b) || Number(b.waiting > 0) - Number(a.waiting > 0) || a.key.localeCompare(b.key),
  );
}

/** The status bar's counts: "N open · M hidden (k waiting)", the waiting part only when a hidden session waits. */
export function sessionCounts(hidden: readonly { id: string }[], open: readonly unknown[], states: States): string {
  const waiting = hidden.filter((s) => stateOf(states, s) === "waiting").length;
  return `${open.length} open · ${hidden.length} hidden${waiting === 0 ? "" : ` (${waiting} waiting)`}`;
}

/**
 * The session the status bar and the panes show as selected: the focused session tab's, or, on a ticket or map
 * tab, that item's live session that most needs the user. `undefined` when the active tab has none.
 */
export function selectedSession<S extends ViewSession>(
  active: ItemRef | undefined,
  sessions: readonly S[],
  states: States,
): S | undefined {
  if (active === undefined) return undefined;
  if (active.kind === "terminal") return sessions.find((s) => s.terminalId === active.id);
  const live = sessions.filter((s) => {
    if (stateOf(states, s) === "ended") return false;
    if (active.kind === "ticket") return s.ticket !== null && ticketKey(s.ticket) === ticketKey(active);
    return s.ticket === null && s.map === active.name;
  });
  return waitingFirst(live, states)[0];
}

/** When each session entered its current state, by session id. */
export type StateSince = ReadonlyMap<string, { state: SessionState; since: number }>;

/**
 * Updates `previous` for the states now known: a session whose state changed is in it since `now`, one seen for the
 * first time since it started. Returns `previous` itself when nothing changed.
 */
export function trackStateSince(
  previous: StateSince,
  sessions: readonly ViewSession[],
  states: States,
  now: number,
): StateSince {
  let next: Map<string, { state: SessionState; since: number }> | null = null;
  for (const session of sessions) {
    const state = stateOf(states, session);
    const known = previous.get(session.id);
    if (known?.state === state) continue;
    next ??= new Map(previous);
    next.set(session.id, { state, since: known === undefined ? Date.parse(session.startedAt) || now : now });
  }
  return next ?? previous;
}

/** A short age: "now" under ten seconds, then seconds, minutes, hours, days. */
export function shortAge(since: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - since) / 1000));
  if (seconds < 10) return "now";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}
