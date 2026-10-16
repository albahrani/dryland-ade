import type { SessionState } from "@dryland/core";
import { type PointerEvent, type ReactNode, useRef, useState } from "react";
import type { SessionInfo } from "../../shared/api.ts";
import { SESSION_META } from "../../shared/session-meta.ts";
import {
  clampShare,
  groupCount,
  groupSessions,
  SESSION_GROUPINGS,
  type SessionGrouping,
  type SessionsLayout,
  type SessionsPane,
  shortAge,
  type StateSince,
  UNLINKED,
} from "../../shared/sessions-view.ts";
import { type SessionHandlers, UnseenMark } from "./SessionControls.tsx";
import { SessionBadge } from "./status.tsx";

const GROUPING_LABELS: Record<SessionGrouping, string> = { map: "map", agent: "agent", none: "none" };

/** What the view reads of each session besides its state: its item's title, its age and its last output line. */
export interface SessionLookups {
  /** The title of the ticket or map the session works on. */
  title(session: SessionInfo): string;
  /** A map's title by name, for the map groups. */
  mapTitle(name: string): string;
  /** The newest non-empty line its open tab shows, `null` when there is none. */
  lastLine(session: SessionInfo): string | null;
}

/** A pane header's badges: the waiting count in gold, then the total. */
function Counts({ waiting, total }: { waiting: number; total: number }) {
  return (
    <span className="pane-counts">
      {waiting > 0 && (
        <span className="count waiting" title={`${waiting} waiting`} aria-label={`${waiting} waiting`}>
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
  title,
  waiting,
  total,
  collapsed,
  grow,
  onToggle,
  children,
}: {
  id: SessionsPane;
  title: string;
  waiting: number;
  total: number;
  collapsed: boolean;
  /** Its share of the panes' height, `null` to take what the other leaves. */
  grow: number | null;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section
      className={`pane ${id}`}
      aria-label={`${title} sessions`}
      style={collapsed ? { flex: "none" } : { flex: grow === null ? "1 1 0" : `${grow} 1 0` }}
    >
      <button className="pane-header" aria-expanded={!collapsed} onClick={onToggle}>
        <span>
          {collapsed ? "▸" : "▾"} {title}
        </span>
        <Counts waiting={waiting} total={total} />
      </button>
      {!collapsed && <div className="pane-body">{children}</div>}
    </section>
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

export function SessionsView({
  hidden,
  open,
  states,
  since,
  now,
  selected,
  layout,
  lookups,
  handlers,
  onLayout,
}: {
  /** Live sessions with no tab, waiting first. */
  hidden: SessionInfo[];
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
  /** Called when the layout changes; `save` is false while the sash is being dragged. */
  onLayout: (layout: SessionsLayout, save: boolean) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  // Map groups start collapsed; this holds the ones the user expanded. View-local, like the Tickets view's.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const panes = useRef<HTMLDivElement>(null);
  const stateOf = (session: SessionInfo) => states[session.id] ?? "launched";
  const waiting = (sessions: SessionInfo[]) => sessions.filter((s) => stateOf(s) === "waiting").length;
  const { collapsed, grouping, hiddenShare } = layout;
  const bothOpen = !collapsed.hidden && !collapsed.open;
  const toggle = (pane: SessionsPane) =>
    onLayout({ ...layout, collapsed: { ...collapsed, [pane]: !collapsed[pane] } }, true);

  const dragShare = (event: PointerEvent<HTMLDivElement>) => {
    const box = panes.current?.getBoundingClientRect();
    if (box === undefined || box.height === 0) return hiddenShare;
    return clampShare((event.clientY - box.top) / box.height);
  };

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
  const groups = groupSessions(hidden, states, grouping);

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
          title="Hidden"
          waiting={waiting(hidden)}
          total={hidden.length}
          collapsed={collapsed.hidden}
          grow={bothOpen ? hiddenShare : null}
          onToggle={() => toggle("hidden")}
        >
          {hidden.length === 0 && <p className="empty">No hidden sessions.</p>}
          {grouping === "none" ? (
            <ul className="tree">{hidden.map(row)}</ul>
          ) : (
            <ul className="tree">
              {groups.map((group) => {
                const isOpen = expanded.has(group.key);
                const label = grouping === "map" && group.key !== UNLINKED ? lookups.mapTitle(group.key) : group.key;
                // Under a collapsed group the waiting sessions stay in view.
                const shown = isOpen ? group.sessions : group.sessions.filter((s) => stateOf(s) === "waiting");
                return (
                  <li key={group.key} className="branch">
                    <button
                      className="branch-label"
                      aria-expanded={isOpen}
                      title={group.breakdown}
                      onClick={() =>
                        setExpanded((current) => {
                          const next = new Set(current);
                          if (!next.delete(group.key)) next.add(group.key);
                          return next;
                        })
                      }
                    >
                      {isOpen ? "▾" : "▸"} {label} {groupCount(group)}
                    </button>
                    {shown.length > 0 && <ul>{shown.map(row)}</ul>}
                  </li>
                );
              })}
            </ul>
          )}
        </Pane>
        {bothOpen && (
          <div
            className="sash"
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize Hidden and Open"
            aria-valuenow={Math.round(hiddenShare * 100)}
            onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                onLayout({ ...layout, hiddenShare: dragShare(event) }, false);
            }}
            onPointerUp={(event) => {
              event.currentTarget.releasePointerCapture(event.pointerId);
              onLayout({ ...layout, hiddenShare: dragShare(event) }, true);
            }}
          />
        )}
        <Pane
          id="open"
          title="Open"
          waiting={waiting(open)}
          total={open.length}
          collapsed={collapsed.open}
          grow={bothOpen ? 1 - hiddenShare : null}
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
