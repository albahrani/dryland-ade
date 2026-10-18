import type { SessionState, TicketRef } from "@dryland/core";
import { type PointerEvent, type ReactNode, useRef, useState } from "react";
import type { SessionInfo } from "../../shared/api.ts";
import { SESSION_META } from "../../shared/session-meta.ts";
import {
  dragSash,
  groupCount,
  groupPaused,
  groupSessions,
  type PausedItem,
  pausedPill,
  pausedTotals,
  SESSION_GROUPINGS,
  type SessionGroup,
  type SessionGrouping,
  type SessionsLayout,
  SESSIONS_PANES,
  type SessionsPane,
  shortAge,
  type StateSince,
  UNLINKED,
  type ViewSession,
} from "../../shared/sessions-view.ts";
import { type SessionHandlers, UnseenMark } from "./SessionControls.tsx";
import { PausedBadge, SessionBadge } from "./status.tsx";

const GROUPING_LABELS: Record<SessionGrouping, string> = { map: "map", agent: "agent", none: "none" };

const PANE_TITLES: Record<SessionsPane, string> = { hidden: "Hidden", paused: "Paused", open: "Open" };

/** What the view reads of each session besides its state: its item's title, its age and its last output line. */
export interface SessionLookups {
  /** The title of the ticket or map the session works on. */
  title(session: Pick<ViewSession, "ticket" | "map">): string;
  /** A map's title by name, for the map groups. */
  mapTitle(name: string): string;
  /** The newest non-empty line its open tab shows, `null` when there is none. */
  lastLine(session: SessionInfo): string | null;
}

/** What the Paused pane does with a paused session: open its ticket, or resume it (all of them, for the header). */
export interface PausedHandlers {
  open(ticket: TicketRef): void;
  resume(ticket: TicketRef): void;
  resumeAll(): void;
}

/** A pane header's badges: the waiting count in gold, then the total. */
function Counts({ waiting, total, waitingWord }: { waiting: number; total: number; waitingWord: string }) {
  return (
    <span className="pane-counts">
      {waiting > 0 && (
        <span className="count waiting" title={`${waiting} ${waitingWord}`} aria-label={`${waiting} ${waitingWord}`}>
          {waiting}
        </span>
      )}
      <span className="count" title={`${total} in all`} aria-label={`${total} in all`}>
        {total}
      </span>
    </span>
  );
}

function Pane({
  id,
  waiting,
  waitingWord = "waiting",
  total,
  collapsed,
  grow,
  actions,
  onToggle,
  children,
}: {
  id: SessionsPane;
  waiting: number;
  /** What the gold badge counts: "waiting", or "were waiting" for sessions that are paused. */
  waitingWord?: string;
  total: number;
  collapsed: boolean;
  /** Its weight in the panes' height; ignored while collapsed. */
  grow: number;
  /** Buttons in the header beside the toggle, such as Resume all. */
  actions?: ReactNode;
  onToggle: () => void;
  children: ReactNode;
}) {
  const title = PANE_TITLES[id];
  return (
    <section
      className={`pane ${id}`}
      aria-label={`${title} sessions`}
      style={collapsed ? { flex: "none" } : { flex: `${grow} 1 0` }}
    >
      <div className="pane-header">
        <button className="pane-toggle" aria-expanded={!collapsed} onClick={onToggle}>
          <span>
            {collapsed ? "▸" : "▾"} {title}
          </span>
          <Counts waiting={waiting} total={total} waitingWord={waitingWord} />
        </button>
        {actions}
      </div>
      {!collapsed && <div className="pane-body">{children}</div>}
    </section>
  );
}

/** A pane's tree: the sessions in groups by map or agent, or flat. Waiting ones stay in view under a collapsed group. */
function Tree<S extends ViewSession>({
  groups,
  grouping,
  expanded,
  isWaiting,
  mapTitle,
  onToggle,
  row,
}: {
  groups: SessionGroup<S>[];
  grouping: SessionGrouping;
  /** The keys of the groups the user expanded; map groups start collapsed. */
  expanded: ReadonlySet<string>;
  isWaiting: (session: S) => boolean;
  mapTitle: (name: string) => string;
  onToggle: (key: string) => void;
  row: (session: S) => ReactNode;
}) {
  if (grouping === "none") return <ul className="tree">{groups.flatMap((group) => group.sessions).map(row)}</ul>;
  return (
    <ul className="tree">
      {groups.map((group) => {
        const isOpen = expanded.has(group.key);
        const label = grouping === "map" && group.key !== UNLINKED ? mapTitle(group.key) : group.key;
        const shown = isOpen ? group.sessions : group.sessions.filter(isWaiting);
        return (
          <li key={group.key} className="branch">
            <button
              className="branch-label"
              aria-expanded={isOpen}
              title={group.breakdown}
              onClick={() => onToggle(group.key)}
            >
              {isOpen ? "▾" : "▸"} {label} {groupCount(group)}
            </button>
            {shown.length > 0 && <ul>{shown.map(row)}</ul>}
          </li>
        );
      })}
    </ul>
  );
}

function HiddenRow({
  session,
  state,
  since,
  now,
  selected,
  unseen,
  title,
  handlers,
}: {
  session: SessionInfo;
  state: SessionState;
  since: number | undefined;
  now: number;
  selected: boolean;
  unseen: boolean;
  title: string;
  handlers: SessionHandlers;
}) {
  return (
    <li className={selected ? "session-row active" : "session-row"} aria-current={selected}>
      <SessionBadge agent={session.agent.name} state={state} />
      <button className="session-title" title={title} onClick={() => handlers.show(session)}>
        {title}
      </button>
      <span className="meta">
        {SESSION_META[state].label}
        {since !== undefined && ` · ${shortAge(since, now)}`}
      </span>
      {unseen && <UnseenMark />}
      <button className="row-action" aria-label={`Stop ${title}`} onClick={() => handlers.stop(session)}>
        Stop
      </button>
    </li>
  );
}

/** A paused session's row: its pill ("was waiting", "interrupted", "paused") with its age, and Resume on hover. */
function PausedRow({
  item,
  now,
  title,
  handlers,
}: {
  item: PausedItem;
  now: number;
  title: string;
  handlers: PausedHandlers;
}) {
  const { was, agent, lastSeen } = item.paused;
  const seen = Date.parse(lastSeen);
  const { ticket } = item;
  return (
    <li className="session-row paused-row">
      <PausedBadge agent={agent} was={was} />
      <button className="session-title" title={title} onClick={() => handlers.open(ticket)}>
        {title}
      </button>
      <span className={`meta paused-pill ${was ?? "plain"}`}>
        {pausedPill(was)}
        {!Number.isNaN(seen) && ` · ${shortAge(seen, now)}`}
      </span>
      <button className="row-action" aria-label={`Resume ${title}`} onClick={() => handlers.resume(ticket)}>
        Resume
      </button>
    </li>
  );
}

export function SessionsView({
  hidden,
  paused,
  open,
  states,
  since,
  now,
  selected,
  layout,
  lookups,
  handlers,
  pausedHandlers,
  onLayout,
}: {
  /** Live sessions with no tab, waiting first. */
  hidden: SessionInfo[];
  /** Paused sessions, as the Paused pane lists them. */
  paused: PausedItem[];
  /** Sessions with an open tab, waiting first. */
  open: SessionInfo[];
  states: Readonly<Record<string, SessionState>>;
  since: StateSince;
  now: number;
  /** The id of the session the status bar shows. */
  selected: string | null;
  layout: SessionsLayout;
  lookups: SessionLookups;
  handlers: SessionHandlers;
  pausedHandlers: PausedHandlers;
  /** Called when the layout changes; `save` is false while a sash is being dragged. */
  onLayout: (layout: SessionsLayout, save: boolean) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  // Map groups start collapsed; these hold the ones the user expanded, per pane. View-local, like the Tickets view's.
  const [expanded, setExpanded] = useState<{ hidden: Set<string>; paused: Set<string> }>({
    hidden: new Set(),
    paused: new Set(),
  });
  const panes = useRef<HTMLDivElement>(null);
  const stateOf = (session: SessionInfo) => states[session.id] ?? "launched";
  const waiting = (sessions: SessionInfo[]) => sessions.filter((s) => stateOf(s) === "waiting").length;
  const { collapsed, grouping, shares } = layout;
  const toggle = (pane: SessionsPane) =>
    onLayout({ ...layout, collapsed: { ...collapsed, [pane]: !collapsed[pane] } }, true);
  const toggleGroup = (pane: "hidden" | "paused") => (key: string) =>
    setExpanded((current) => {
      const next = new Set(current[pane]);
      if (!next.delete(key)) next.add(key);
      return { ...current, [pane]: next };
    });

  const expandedPanes = SESSIONS_PANES.filter((pane) => !collapsed[pane]);
  const total = expandedPanes.reduce((sum, pane) => sum + shares[pane], 0);
  const sashAfter = (pane: SessionsPane) => expandedPanes[expandedPanes.indexOf(pane) + 1];
  const dragTo = (pane: SessionsPane, event: PointerEvent<HTMLDivElement>) => {
    const box = panes.current?.getBoundingClientRect();
    if (box === undefined || box.height === 0) return shares;
    return dragSash(shares, collapsed, pane, (event.clientY - box.top) / box.height);
  };
  const sash = (pane: SessionsPane) => {
    const below = sashAfter(pane);
    if (below === undefined) return null;
    return (
      <div
        className="sash"
        role="separator"
        aria-orientation="horizontal"
        aria-label={`Resize ${PANE_TITLES[pane]} and ${PANE_TITLES[below]}`}
        aria-valuenow={Math.round((shares[pane] / (shares[pane] + shares[below])) * 100)}
        onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            onLayout({ ...layout, shares: dragTo(pane, event) }, false);
        }}
        onPointerUp={(event) => {
          event.currentTarget.releasePointerCapture(event.pointerId);
          onLayout({ ...layout, shares: dragTo(pane, event) }, true);
        }}
      />
    );
  };
  const grow = (pane: SessionsPane) => (total === 0 ? 1 : shares[pane] / total);

  const row = (session: SessionInfo) => (
    <HiddenRow
      key={session.id}
      session={session}
      state={stateOf(session)}
      since={since.get(session.id)?.since}
      now={now}
      selected={session.id === selected}
      unseen={handlers.unseen(session)}
      title={lookups.title(session)}
      handlers={handlers}
    />
  );
  const pausedRow = (item: PausedItem) => (
    <PausedRow key={item.id} item={item} now={now} title={lookups.title(item)} handlers={pausedHandlers} />
  );
  const pausedTotal = pausedTotals(paused);

  return (
    <section className="sessions" aria-label="Sessions">
      <header className="view-header">
        <h2>Sessions</h2>
        <button
          aria-label="More actions"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          ...
        </button>
      </header>
      {menuOpen && (
        <div className="menu" role="menu" aria-label="Sessions view options">
          {SESSION_GROUPINGS.map((value) => (
            <label key={value}>
              <input
                type="radio"
                name="session-grouping"
                checked={grouping === value}
                onChange={() => onLayout({ ...layout, grouping: value }, true)}
              />
              Group by {GROUPING_LABELS[value]}
            </label>
          ))}
        </div>
      )}
      <div className="panes" ref={panes}>
        <Pane
          id="hidden"
          waiting={waiting(hidden)}
          total={hidden.length}
          collapsed={collapsed.hidden}
          grow={grow("hidden")}
          onToggle={() => toggle("hidden")}
        >
          {hidden.length === 0 && <p className="empty">No hidden sessions.</p>}
          <Tree
            groups={groupSessions(hidden, states, grouping)}
            grouping={grouping}
            expanded={expanded.hidden}
            isWaiting={(s) => stateOf(s) === "waiting"}
            mapTitle={lookups.mapTitle}
            onToggle={toggleGroup("hidden")}
            row={row}
          />
        </Pane>
        {!collapsed.hidden && sash("hidden")}
        <Pane
          id="paused"
          waiting={pausedTotal.waiting}
          waitingWord="were waiting"
          total={pausedTotal.total}
          collapsed={collapsed.paused}
          grow={grow("paused")}
          actions={
            paused.length > 0 && (
              <button className="row-action pane-action" onClick={pausedHandlers.resumeAll}>
                Resume all
              </button>
            )
          }
          onToggle={() => toggle("paused")}
        >
          {paused.length === 0 && <p className="empty">No paused sessions.</p>}
          <Tree
            groups={groupPaused(paused, grouping)}
            grouping={grouping}
            expanded={expanded.paused}
            isWaiting={(item) => item.paused.was === "waiting"}
            mapTitle={lookups.mapTitle}
            onToggle={toggleGroup("paused")}
            row={pausedRow}
          />
        </Pane>
        {!collapsed.paused && sash("paused")}
        <Pane
          id="open"
          waiting={waiting(open)}
          total={open.length}
          collapsed={collapsed.open}
          grow={grow("open")}
          onToggle={() => toggle("open")}
        >
          {open.length === 0 && <p className="empty">No session tabs are open.</p>}
          <ul className="tree">
            {open.map((session) => {
              const state = stateOf(session);
              const title = lookups.title(session);
              const line = lookups.lastLine(session);
              return (
                <li
                  key={session.id}
                  className={session.id === selected ? "session-row two-line active" : "session-row two-line"}
                  aria-current={session.id === selected}
                >
                  <SessionBadge agent={session.agent.name} state={state} />
                  <span className="session-lines">
                    <button className="session-title" title={title} onClick={() => handlers.show(session)}>
                      {title}
                    </button>
                    <span className="meta last-line">{line ?? SESSION_META[state].label}</span>
                  </span>
                  {handlers.unseen(session) && <UnseenMark />}
                </li>
              );
            })}
          </ul>
        </Pane>
      </div>
    </section>
  );
}
