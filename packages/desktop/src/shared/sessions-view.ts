import type { PausedWas, SessionState, TicketRef, TicketsTree } from "@dryland/core";
import { SESSION_META } from "./session-meta.ts";
import type { PausedSession } from "./paused-session.ts";
import { type ItemRef, ticketKey } from "./tabs.ts";
import { isScratch } from "./work-target.ts";

/** How the Hidden pane groups its tree: by map (Unlinked last), by agent, or not at all. Never by state. */
export const SESSION_GROUPINGS = ["map", "agent", "none"] as const;
export type SessionGrouping = (typeof SESSION_GROUPINGS)[number];

/** The Sessions view's panes, top to bottom. */
export const SESSIONS_PANES = ["hidden", "paused", "open"] as const;
export type SessionsPane = (typeof SESSIONS_PANES)[number];

/** What the Sessions view remembers per project: its grouping, which panes are collapsed, and how tall each is. */
export interface SessionsLayout {
  grouping: SessionGrouping;
  collapsed: Record<SessionsPane, boolean>;
  /** Each pane's weight in the panes' height while expanded; only their ratios matter. */
  shares: Record<SessionsPane, number>;
}

export const DEFAULT_SESSIONS_LAYOUT: SessionsLayout = {
  grouping: "map",
  collapsed: { hidden: false, paused: false, open: false },
  shares: { hidden: 0.35, paused: 0.25, open: 0.4 },
};

/** The least share of the expanded panes' height a pane keeps when a sash is dragged. */
const MIN_SHARE = 0.1;

/** Keeps a share off the edges, so no pane can be dragged to nothing but its header. */
export const clampShare = (share: number): number => Math.min(0.9, Math.max(MIN_SHARE, share));

/**
 * Moves the sash below `pane` to `fraction` (0 at the top of the panes, 1 at the bottom). Only `pane` and the next
 * expanded pane change. Returns `shares` itself when no expanded pane lies below.
 */
export function dragSash(
  shares: SessionsLayout["shares"],
  collapsed: SessionsLayout["collapsed"],
  pane: SessionsPane,
  fraction: number,
): SessionsLayout["shares"] {
  const expanded = SESSIONS_PANES.filter((p) => !collapsed[p]);
  const index = expanded.indexOf(pane);
  const below = expanded[index + 1];
  if (index < 0 || below === undefined) return shares;
  const total = expanded.reduce((sum, p) => sum + shares[p], 0);
  const before = expanded.slice(0, index).reduce((sum, p) => sum + shares[p] / total, 0);
  const pair = (shares[pane] + shares[below]) / total;
  const own = Math.max(MIN_SHARE, Math.min(pair - MIN_SHARE, fraction - before));
  return { ...shares, [pane]: own * total, [below]: (pair - own) * total };
}

const isShare = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

/**
 * Reads a saved layout defensively: each field on its own, anything unreadable falls back to its default. A layout
 * saved with the two-pane view's single `hiddenShare` keeps its split between Hidden and Open.
 */
export function parseSessionsLayout(raw: unknown): SessionsLayout {
  const r = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const collapsed =
    r.collapsed !== null && typeof r.collapsed === "object" ? (r.collapsed as Record<string, unknown>) : {};
  const saved = r.shares !== null && typeof r.shares === "object" ? (r.shares as Record<string, unknown>) : {};
  const defaults = DEFAULT_SESSIONS_LAYOUT.shares;
  let shares = defaults;
  if (isShare(saved.hidden) && isShare(saved.paused) && isShare(saved.open)) {
    shares = { hidden: saved.hidden, paused: saved.paused, open: saved.open };
  } else if (typeof r.hiddenShare === "number" && Number.isFinite(r.hiddenShare)) {
    const hidden = clampShare(r.hiddenShare);
    const rest = 1 - defaults.paused;
    shares = { hidden: hidden * rest, paused: defaults.paused, open: (1 - hidden) * rest };
  }
  return {
    grouping: SESSION_GROUPINGS.includes(r.grouping as SessionGrouping)
      ? (r.grouping as SessionGrouping)
      : DEFAULT_SESSIONS_LAYOUT.grouping,
    collapsed: { hidden: collapsed.hidden === true, paused: collapsed.paused === true, open: collapsed.open === true },
    shares,
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
export function sessionItemTitle(
  tree: TicketsTree | null,
  session: Pick<ViewSession, "ticket" | "map"> & { worktree?: { branch: string }; manual?: true },
): string {
  const { ticket } = session;
  if (ticket === null)
    return session.map === null
      ? isScratch(session)
        ? "Scratch"
        : session.manual
          ? "Unlinked"
          : "New map"
      : mapTitle(tree, session.map);
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

/**
 * The status bar's counts: "N open · M hidden (k waiting) · P paused", the waiting part only when a hidden session
 * waits and the paused part only when a session is paused.
 */
export function sessionCounts(
  hidden: readonly { id: string }[],
  open: readonly unknown[],
  states: States,
  paused = 0,
): string {
  const waiting = hidden.filter((s) => stateOf(states, s) === "waiting").length;
  const counts = `${open.length} open · ${hidden.length} hidden${waiting === 0 ? "" : ` (${waiting} waiting)`}`;
  return paused === 0 ? counts : `${counts} · ${paused} paused`;
}

/** A paused session as the Paused pane lists it: shaped like a session, so it groups like one. */
export interface PausedItem extends ViewSession {
  /** The ticket's `map/id`. */
  id: string;
  ticket: TicketRef;
  paused: PausedSession;
}

/** The paused sessions as rows, one per ticket, in the order given. */
export function pausedItems(paused: Readonly<Record<string, PausedSession>>): PausedItem[] {
  return Object.entries(paused).flatMap(([key, session]) => {
    const slash = key.lastIndexOf("/");
    if (slash <= 0) return [];
    const ticket = { map: key.slice(0, slash), id: key.slice(slash + 1) };
    return [
      {
        id: key,
        terminalId: "",
        agent: { name: session.agent },
        ticket,
        map: ticket.map,
        startedAt: session.lastSeen,
        paused: session,
      },
    ];
  });
}

const PAUSED_PILLS: Record<NonNullable<PausedWas>, string> = { waiting: "was waiting", interrupted: "interrupted" };

/** A paused row's pill: what the session was doing when it stopped. */
export const pausedPill = (was: PausedWas): string => (was === null ? "paused" : PAUSED_PILLS[was]);

/** A paused item's stand-in state: it ranks and counts as waiting only when it was. */
const pausedStates = (items: readonly PausedItem[]): Record<string, SessionState> =>
  Object.fromEntries(items.map((item) => [item.id, item.paused.was === "waiting" ? "waiting" : "idle"]));

/** "1 was waiting, 2 interrupted, 1 paused", most urgent first. */
function pausedBreakdown(items: readonly PausedItem[]): string {
  return (["waiting", "interrupted", null] as const)
    .map((was) => [items.filter((item) => item.paused.was === was).length, was] as const)
    .filter(([count]) => count > 0)
    .map(([count, was]) => `${count} ${pausedPill(was)}`)
    .join(", ");
}

/**
 * The Paused tree's groups, built as Hidden's are: was-waiting sessions first within a group and groups holding one
 * first, so a group's `waiting` is its was-waiting count.
 */
export function groupPaused(items: readonly PausedItem[], grouping: SessionGrouping): SessionGroup<PausedItem>[] {
  return groupSessions(items, pausedStates(items), grouping).map((group) => ({
    ...group,
    breakdown: pausedBreakdown(group.sessions),
  }));
}

/** The Paused pane's header counts: those that were waiting, then all. */
export const pausedTotals = (items: readonly PausedItem[]): { waiting: number; total: number } => ({
  waiting: items.filter((item) => item.paused.was === "waiting").length,
  total: items.length,
});

/** What a map holds in sessions, for its row and its tab's header strip. */
export interface MapSessionCounts {
  /** Live sessions on the map with a tab. */
  open: number;
  /** Live sessions on the map with no tab. */
  hidden: number;
  /** Of the hidden ones, those waiting for the user. */
  hiddenWaiting: number;
  /** Live sessions on the map, open or hidden, waiting for the user. */
  waiting: number;
  paused: number;
  /** Of the paused ones, those that were waiting. */
  pausedWaiting: number;
}

/** The counts of the sessions on `map` (its own and its tickets'), live and paused. */
export function mapSessionCounts<S extends ViewSession>(
  map: string,
  sessions: readonly S[],
  states: States,
  paused: Readonly<Record<string, Pick<PausedSession, "was">>>,
  tabs: readonly ItemRef[],
): MapSessionCounts {
  const { hidden, open } = splitSessions(
    sessions.filter((s) => s.map === map),
    states,
    tabs,
  );
  const live = [...hidden, ...open].filter((s) => stateOf(states, s) !== "ended");
  const onMap = Object.entries(paused).filter(([key]) => key.startsWith(`${map}/`));
  return {
    open: open.filter((s) => stateOf(states, s) !== "ended").length,
    hidden: hidden.length,
    hiddenWaiting: hidden.filter((s) => stateOf(states, s) === "waiting").length,
    waiting: live.filter((s) => stateOf(states, s) === "waiting").length,
    paused: onMap.length,
    pausedWaiting: onMap.filter(([, p]) => p.was === "waiting").length,
  };
}

/** The tooltip of a map's counts: "1 waiting for you, 2 paused (1 was waiting)"; empty when it holds neither. */
export function mapCountsLabel({ waiting, paused, pausedWaiting }: MapSessionCounts): string {
  return [
    waiting > 0 ? `${waiting} waiting for you` : "",
    paused > 0 ? `${paused} paused${pausedWaiting > 0 ? ` (${pausedWaiting} was waiting)` : ""}` : "",
  ]
    .filter((part) => part !== "")
    .join(", ");
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
  if (active.kind === "file" || active.kind === "diff") return undefined;
  const live = sessions.filter((s) => {
    if (stateOf(states, s) === "ended") return false;
    if (active.kind !== "map") return s.ticket !== null && ticketKey(s.ticket) === ticketKey(active);
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
