import type { TicketsTree, TicketStatus, TreeTicket } from "@dryland/core";
import { useState } from "react";
import {
  applyViewOptions,
  DEFAULT_VIEW_OPTIONS,
  OPEN_STATUSES,
  type TicketSort,
  type ViewOptions,
} from "../../shared/view-options.ts";
import { STATUS_LABEL, StatusIcon } from "./status.tsx";

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
  if (ticket.blockers === "unknown") return <span className="meta">blocked by: unknown</span>;
  if (ticket.blockers.length === 0) return null;
  return <span className="meta">blocked by {ticket.blockers.join(", ")}</span>;
}

function TicketRow({ ticket }: { ticket: TreeTicket }) {
  return (
    <li className="ticket">
      <StatusIcon status={ticket.status} />
      <span className="ticket-id">{ticket.id}</span>
      <span className="ticket-title">{ticket.title}</span>
      {ticket.claimant !== null && <span className="meta">claimed by {ticket.claimant}</span>}
      <Blockers ticket={ticket} />
    </li>
  );
}

function Branch({
  id,
  label,
  collapsed,
  toggle,
  children,
}: {
  id: string;
  label: string;
  collapsed: Set<string>;
  toggle: (id: string) => void;
  children: React.ReactNode;
}) {
  const closed = collapsed.has(id);
  return (
    <li className="branch">
      <button className="branch-label" aria-expanded={!closed} onClick={() => toggle(id)}>
        {closed ? "▸" : "▾"} {label}
      </button>
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
          Show {STATUS_LABEL[status].toLowerCase()}
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

export function TicketsView({ tree }: { tree: TicketsTree }) {
  const [options, setOptions] = useState<ViewOptions>(DEFAULT_VIEW_OPTIONS);
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // The "N done" lines are folded by default and expand on click.
  const [expandedDone, setExpandedDone] = useState<Set<string>>(new Set());
  const view = applyViewOptions(tree, options);
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
          <Branch key={map.name} id={map.name} label={map.title} collapsed={collapsed} toggle={toggle}>
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
                    <ul>
                      {map[key].map((t) => (
                        <TicketRow key={t.id} ticket={t} />
                      ))}
                    </ul>
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
                  {expandedDone.has(map.name) && (
                    <ul>
                      {map.done.map((t) => (
                        <TicketRow key={t.id} ticket={t} />
                      ))}
                    </ul>
                  )}
                </li>
              )}
            </ul>
          </Branch>
        ))}
      </ul>
    </section>
  );
}
