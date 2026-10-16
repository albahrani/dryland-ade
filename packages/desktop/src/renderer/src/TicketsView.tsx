import type { NextUpMarker, TicketsTree, TicketStatus, TreeTicket } from "@dryland/core";
import { useState } from "react";
import {
  applyViewOptions,
  DEFAULT_VIEW_OPTIONS,
  OPEN_STATUSES,
  type TicketSort,
  type ViewOptions,
} from "../../shared/view-options.ts";
import { STATUS_META } from "../../shared/status-meta.ts";
import { formatBlockers } from "../../shared/blockers.ts";
import { mapMarker, type NextUp, ticketMarker } from "../../shared/next-up.ts";
import { NextUpStar } from "./NextUp.tsx";
import type { TicketSession } from "../../shared/session-meta.ts";
import { type ItemRef, tabKey, ticketKey } from "../../shared/tabs.ts";
import { SessionBadge, StatusIcon } from "./status.tsx";

/** The ticket kinds a map lists after its fog, in workflow order. */
const KINDS = [
  { key: "planning", label: "Planning" },
  { key: "implementation", label: "Implementation" },
] as const;

const SORTS: { value: TicketSort; label: string }[] = [
  { value: "number", label: "Ticket number" },
  { value: "title", label: "Title" },
  { value: "status", label: "Status" },
];

function Blockers({ ticket }: { ticket: TreeTicket }) {
  const text = formatBlockers(ticket.blockers);
  if (text === null) return null;
  return <span className="meta">{ticket.blockers === "unknown" ? `blocked by: ${text}` : `blocked by ${text}`}</span>;
}

function TicketRow({
  ticket,
  active,
  session,
  marker,
  stale,
  onOpen,
  onRelease,
  onShowSession,
}: {
  ticket: TreeTicket;
  active: boolean;
  session: TicketSession | undefined;
  marker: NextUpMarker | undefined;
  /** Whether its claim is held by no live Dryland session. */
  stale: boolean;
  onOpen: (ref: ItemRef) => void;
  onRelease: (ticket: TreeTicket) => void;
  onShowSession: (sessionId: string) => void;
}) {
  const classes = ["ticket", active && "active", marker !== undefined && "next-up"].filter(Boolean).join(" ");
  return (
    <li className={classes} title={marker?.step.reason}>
      {marker !== undefined && <NextUpStar marker={marker} onShow={onShowSession} />}
      <StatusIcon status={ticket.status} />
      {session !== undefined && <SessionBadge agent={session.agent} state={session.state} />}
      <span className="ticket-id">{ticket.id}</span>
      <button
        className="ticket-title"
        aria-current={active}
        onClick={() => onOpen({ kind: "ticket", map: ticket.map, id: ticket.id })}
      >
        {ticket.title}
      </button>
      {stale ? (
        <>
          <span className="meta stale">
            claimed{ticket.claimant === null ? "" : ` by ${ticket.claimant}`}, possibly stale
          </span>
          <button
            className="row-action"
            aria-label={`Release ${ticket.map}/${ticket.id}`}
            onClick={() => onRelease(ticket)}
          >
            Release
          </button>
        </>
      ) : (
        ticket.claimant !== null && <span className="meta">claimed by {ticket.claimant}</span>
      )}
      <Blockers ticket={ticket} />
    </li>
  );
}

/** A done ticket can be next (a PR, a retro); while its group is folded, its marker shows on the fold. */
function FoldedMarker({ tickets, nextUp }: { tickets: TreeTicket[]; nextUp: NextUp }) {
  const marker = tickets.map((t) => ticketMarker(nextUp, t.map, t.id)).find((m) => m !== undefined);
  return marker === undefined ? null : <NextUpStar marker={marker} />;
}

function Branch({
  id,
  label,
  collapsed,
  toggle,
  onOpen,
  marker,
  children,
}: {
  id: string;
  label: string;
  collapsed: Set<string>;
  toggle: (id: string) => void;
  /** Adds an "Open" button that opens the branch's item in the tab area. */
  onOpen?: () => void;
  /** The Next-up marker on the branch's own item, a map. */
  marker?: NextUpMarker;
  children: React.ReactNode;
}) {
  const closed = collapsed.has(id);
  return (
    <li className="branch">
      <div className={marker === undefined ? "branch-head" : "branch-head next-up"}>
        {marker !== undefined && <NextUpStar marker={marker} />}
        <button className="branch-label" aria-expanded={!closed} onClick={() => toggle(id)}>
          {closed ? "▸" : "▾"} {label}
        </button>
        {onOpen !== undefined && (
          <button className="branch-open" aria-label={`Open map ${label}`} title="Open map" onClick={onOpen}>
            ↗
          </button>
        )}
      </div>
      {!closed && children}
    </li>
  );
}

function OptionsMenu({
  options,
  onChange,
  onExpandAll,
  onCollapseAll,
}: {
  options: ViewOptions;
  onChange: (options: ViewOptions) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}) {
  const toggleStatus = (status: TicketStatus) =>
    onChange({
      ...options,
      statuses: options.statuses.includes(status)
        ? options.statuses.filter((s) => s !== status)
        : [...options.statuses, status],
    });
  return (
    <div className="menu" role="menu" aria-label="Tickets view options">
      <button role="menuitem" onClick={onExpandAll}>
        Expand all
      </button>
      <button role="menuitem" onClick={onCollapseAll}>
        Collapse all
      </button>
      <hr />
      {SORTS.map(({ value, label }) => (
        <label key={value}>
          <input
            type="radio"
            name="sort"
            checked={options.sort === value}
            onChange={() => onChange({ ...options, sort: value })}
          />
          Sort by {label.toLowerCase()}
        </label>
      ))}
      <hr />
      {OPEN_STATUSES.map((status) => (
        <label key={status}>
          <input type="checkbox" checked={options.statuses.includes(status)} onChange={() => toggleStatus(status)} />
          Show {STATUS_META[status].label.toLowerCase()}
        </label>
      ))}
      <label>
        <input
          type="checkbox"
          checked={options.showDone}
          onChange={() => onChange({ ...options, showDone: !options.showDone })}
        />
        Show done
      </label>
      <label>
        <input
          type="checkbox"
          checked={options.showFog}
          onChange={() => onChange({ ...options, showFog: !options.showFog })}
        />
        Show fog
      </label>
    </div>
  );
}

export function TicketsView({
  tree,
  activeKey,
  sessions,
  nextUp,
  staleClaims,
  onOpen,
  onRelease,
  onShowSession,
  onNewTicket,
}: {
  tree: TicketsTree;
  /** The `tabKey` of the focused tab, if any. */
  activeKey: string | null;
  /** The session working on each ticket, by `map/id`. */
  sessions: ReadonlyMap<string, TicketSession>;
  nextUp: NextUp;
  /** The `map/id` of every claim no live Dryland session holds. */
  staleClaims: readonly string[];
  onOpen: (ref: ItemRef) => void;
  /** Releases a possibly stale claim; a general button, so it asks for confirmation first. */
  onRelease: (ticket: TreeTicket) => void;
  /** Shows the live session a marker's step targets, such as one waiting for input. */
  onShowSession: (sessionId: string) => void;
  onNewTicket: () => void;
}) {
  const [options, setOptions] = useState<ViewOptions>(DEFAULT_VIEW_OPTIONS);
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // The "N done" lines are folded by default and expand on click.
  const [expandedDone, setExpandedDone] = useState<Set<string>>(new Set());
  const view = applyViewOptions(tree, options);
  const isActive = (t: TreeTicket) => activeKey === tabKey({ kind: "ticket", map: t.map, id: t.id });
  const renderRow = (t: TreeTicket) => (
    <TicketRow
      key={t.id}
      ticket={t}
      active={isActive(t)}
      session={sessions.get(ticketKey(t))}
      marker={ticketMarker(nextUp, t.map, t.id)}
      stale={staleClaims.includes(ticketKey(t))}
      onOpen={onOpen}
      onRelease={onRelease}
      onShowSession={onShowSession}
    />
  );
  const flip = (id: string) => (current: Set<string>) => {
    const next = new Set(current);
    if (!next.delete(id)) next.add(id);
    return next;
  };
  const toggle = (id: string) => setCollapsed(flip(id));
  const doneIds = view.maps.map((map) => map.name);
  const branchIds = view.maps.flatMap((map) => [
    map.name,
    `${map.name}/fog`,
    ...KINDS.map(({ key }) => `${map.name}/${key}`),
  ]);

  return (
    <section className="tickets" aria-label="Tickets">
      <header className="view-header">
        <h2>Tickets</h2>
        <span>
          <button aria-label="New ticket" title="New ticket" onClick={onNewTicket}>
            +
          </button>
          <button
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            ...
          </button>
        </span>
      </header>
      {menuOpen && (
        <OptionsMenu
          options={options}
          onChange={setOptions}
          onExpandAll={() => {
            setCollapsed(new Set());
            setExpandedDone(new Set(doneIds));
          }}
          onCollapseAll={() => {
            setCollapsed(new Set(branchIds));
            setExpandedDone(new Set());
          }}
        />
      )}
      {view.maps.length === 0 && <p className="empty">This project has no tickets yet.</p>}
      <ul className="tree">
        {view.maps.map((map) => (
          <Branch
            key={map.name}
            id={map.name}
            label={map.title}
            collapsed={collapsed}
            toggle={toggle}
            onOpen={() => onOpen({ kind: "map", name: map.name })}
            marker={mapMarker(nextUp, map.name)}
          >
            <ul>
              {map.fog.length > 0 && (
                <Branch id={`${map.name}/fog`} label={`Fog (${map.fog.length})`} collapsed={collapsed} toggle={toggle}>
                  <ul>
                    {map.fog.map((item) => (
                      <li key={item} className="fog">
                        {item}
                      </li>
                    ))}
                  </ul>
                </Branch>
              )}
              {KINDS.map(({ key, label }) =>
                map[key].length === 0 ? null : (
                  <Branch key={key} id={`${map.name}/${key}`} label={label} collapsed={collapsed} toggle={toggle}>
                    <ul>{map[key].map(renderRow)}</ul>
                  </Branch>
                ),
              )}
              {map.done.length > 0 && (
                <li className="branch">
                  <button
                    className="branch-label"
                    aria-expanded={expandedDone.has(map.name)}
                    onClick={() => setExpandedDone(flip(map.name))}
                  >
                    {expandedDone.has(map.name) ? "▾" : "▸"} {map.done.length} done
                  </button>
                  {!expandedDone.has(map.name) && <FoldedMarker tickets={map.done} nextUp={nextUp} />}
                  {expandedDone.has(map.name) && <ul>{map.done.map(renderRow)}</ul>}
                </li>
              )}
            </ul>
          </Branch>
        ))}
      </ul>
    </section>
  );
}
