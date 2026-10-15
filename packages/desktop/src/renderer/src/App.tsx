import type { LiveEvent, TicketRef } from "@dryland/core";
import { useEffect, useRef, useState } from "react";
import type { AppState, LiveEventsPanelMode, ProjectView, SessionInfo } from "../../shared/api.ts";
import { activeItem, closeTab, focusTab, type ItemRef, openTab, tabKey, type TabsState } from "../../shared/tabs.ts";
import { ItemTab } from "./ItemTab.tsx";
import { Legend } from "./Legend.tsx";
import { LiveEventsPanel } from "./LiveEventsPanel.tsx";
import { MapsView } from "./MapsView.tsx";
import { TerminalTab } from "./TerminalTab.tsx";
import { disposeTerminal, getOrCreateTerminal, routeTerminalEvents } from "./terminals.ts";
import { TicketsView } from "./TicketsView.tsx";

type ActivityView = "tickets" | "maps" | "sessions";

/** The panel keeps the newest events only, so a long day does not grow the window's memory without bound. */
const MAX_LIVE_EVENTS = 500;

const ACTIVITIES: { id: ActivityView; label: string; glyph: string }[] = [
  { id: "tickets", label: "Tickets", glyph: "☰" },
  { id: "maps", label: "Maps", glyph: "◈" },
  { id: "sessions", label: "Sessions", glyph: "▶" },
];

function tabLabel(ref: ItemRef, terminalTitles: ReadonlyMap<string, string>): string {
  if (ref.kind === "terminal") return terminalTitles.get(ref.id) ?? "Terminal";
  return ref.kind === "ticket" ? `${ref.map}/${ref.id}` : ref.name;
}

function Sidebar({
  view,
  project,
  tabs,
  onOpen,
}: {
  view: ActivityView;
  project: ProjectView | null;
  tabs: TabsState;
  onOpen: (ref: ItemRef) => void;
}) {
  if (project === null) return <p className="empty">Open a git repo to see its tickets.</p>;
  if (!project.tree.ok) {
    return (
      <div className="notice" role="alert">
        <p>{project.tree.message}</p>
        <p>{project.tree.nextAction}</p>
      </div>
    );
  }
  if (view === "tickets") return <TicketsView tree={project.tree.tree} activeKey={tabs.active} onOpen={onOpen} />;
  if (view === "maps") {
    const active = activeItem(tabs);
    return (
      <MapsView tree={project.tree.tree} activeMap={active?.kind === "map" ? active.name : null} onOpen={onOpen} />
    );
  }
  return <p className="empty">The {view} view arrives in a later ticket.</p>;
}

/** What a session tab says about its session: agent, ticket, worktree and id, as recorded at spawn. */
function SessionHeader({ session }: { session: SessionInfo }) {
  return (
    <dl className="session-header" aria-label="Session">
      <div>
        <dt>Agent</dt>
        <dd>{session.agent.name}</dd>
      </div>
      <div>
        <dt>Ticket</dt>
        <dd>
          {session.ticket.map}/{session.ticket.id}
        </dd>
      </div>
      <div>
        <dt>Worktree</dt>
        <dd title={session.worktree.path}>{session.worktree.branch}</dd>
      </div>
      <div>
        <dt>Session</dt>
        <dd title={session.id}>{session.id.slice(0, 8)}</dd>
      </div>
    </dl>
  );
}

export function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [activity, setActivity] = useState<ActivityView>("tickets");
  // Live events since this window opened; never stored (ADR 0008).
  const [liveEvents, setLiveEvents] = useState<readonly LiveEvent[]>([]);
  // The panel mode the status bar's "Show" returns to.
  const lastVisiblePanel = useRef<LiveEventsPanelMode>("expanded");
  // Tabs whose details header the user collapsed; not persisted.
  const [collapsedHeaders, setCollapsedHeaders] = useState<Set<string>>(new Set());
  // Titles of terminals, numbered in the order they were opened.
  const [terminalTitles, setTerminalTitles] = useState<ReadonlyMap<string, string>>(new Map());
  const terminalsOpened = useRef(0);
  const [terminalError, setTerminalError] = useState<string | null>(null);
  // Sessions this window started, by terminal id; not persisted, like the terminals they run in.
  const [sessions, setSessions] = useState<ReadonlyMap<string, SessionInfo>>(new Map());

  useEffect(() => {
    void window.dryland.getState().then(setState);
    const stopProject = window.dryland.onProjectChanged((project) =>
      setState((current) => current && { ...current, project }),
    );
    const stopTerminals = routeTerminalEvents();
    const stopLive = window.dryland.onLiveEvent((event) =>
      setLiveEvents((current) => [...current.slice(1 - MAX_LIVE_EVENTS), event]),
    );
    return () => {
      stopProject();
      stopTerminals();
      stopLive();
    };
  }, []);

  if (state === null) return null;
  const { project, legendDismissed, tabs, liveEventsPanel } = state;
  if (liveEventsPanel !== "hidden") lastVisiblePanel.current = liveEventsPanel;
  const setLiveEventsPanel = (mode: LiveEventsPanelMode) => {
    setState({ ...state, liveEventsPanel: mode });
    void window.dryland.setLiveEventsPanel(mode);
  };
  const setTabs = (next: TabsState) => {
    setState({ ...state, tabs: next });
    void window.dryland.saveTabs(next);
  };
  const closeItem = (ref: ItemRef) => {
    if (ref.kind === "terminal") {
      window.dryland.closeTerminal(ref.id);
      disposeTerminal(ref.id);
    }
    setTabs(closeTab(tabs, tabKey(ref)));
  };
  const openProject = async () => {
    const next = await window.dryland.openProject();
    // Switching projects kills the main process's terminals; drop the views of those the new state has no tab for.
    const kept = new Set(next.tabs.open.flatMap((tab) => (tab.kind === "terminal" ? [tab.id] : [])));
    for (const id of terminalTitles.keys()) if (!kept.has(id)) disposeTerminal(id);
    setTerminalTitles((current) => new Map([...current].filter(([id]) => kept.has(id))));
    setSessions((current) => new Map([...current].filter(([id]) => kept.has(id))));
    setState(next);
  };
  /** Shows terminal `id` in a new, focused tab; registered first, so its first output is not dropped. */
  const showTerminal = (id: string, title: string) => {
    getOrCreateTerminal(id);
    setTerminalTitles((current) => new Map(current).set(id, title));
    setState((current) => current && { ...current, tabs: openTab(current.tabs, { kind: "terminal", id }) });
  };
  const startWork = async (ticket: TicketRef, agentId: string) => {
    setTerminalError(null);
    const result = await window.dryland.startWork(ticket, agentId);
    if (!result.ok) {
      setTerminalError(`${result.message} ${result.nextAction}`);
      return;
    }
    const { session } = result;
    setSessions((current) => new Map(current).set(session.terminalId, session));
    showTerminal(session.terminalId, `${session.agent.name} ${session.ticket.map}/${session.ticket.id}`);
  };
  const newTerminal = async () => {
    setTerminalError(null);
    let id: string | null;
    try {
      id = await window.dryland.openTerminal();
    } catch (error) {
      setTerminalError(error instanceof Error ? error.message : String(error));
      return;
    }
    if (id === null) return;
    terminalsOpened.current += 1;
    showTerminal(id, `Terminal ${terminalsOpened.current}`);
  };
  const activeTab = activeItem(tabs);
  const activeSession = activeTab?.kind === "terminal" ? sessions.get(activeTab.id) : undefined;
  const terminalIds = tabs.open.flatMap((tab) => (tab.kind === "terminal" ? [tab.id] : []));
  const dismissLegend = () => {
    setState({ ...state, legendDismissed: true });
    void window.dryland.dismissLegend();
  };

  return (
    <div className="shell">
      <header className="menubar">
        <button className="project-widget" onClick={() => void openProject()}>
          {project === null ? "Open project..." : project.name}
        </button>
        <button className="project-widget" disabled={project === null} onClick={() => void newTerminal()}>
          New terminal
        </button>
      </header>
      <nav className="activitybar" aria-label="Activity bar">
        {ACTIVITIES.map(({ id, label, glyph }) => (
          <button
            key={id}
            title={label}
            aria-label={label}
            aria-pressed={activity === id}
            onClick={() => setActivity(id)}
          >
            {glyph}
          </button>
        ))}
      </nav>
      <aside className="sidebar">
        {!legendDismissed && <Legend onDismiss={dismissLegend} />}
        <Sidebar view={activity} project={project} tabs={tabs} onOpen={(ref) => setTabs(openTab(tabs, ref))} />
      </aside>
      <main className="editor">
        {tabs.open.length > 0 && (
          <div className="tabbar" role="tablist" aria-label="Open items">
            {tabs.open.map((tab) => (
              <span key={tabKey(tab)} className="tab" aria-current={tabKey(tab) === tabs.active}>
                <button
                  role="tab"
                  aria-selected={tabKey(tab) === tabs.active}
                  onClick={() => setTabs(focusTab(tabs, tabKey(tab)))}
                >
                  {tabLabel(tab, terminalTitles)}
                </button>
                <button aria-label={`Close ${tabLabel(tab, terminalTitles)}`} onClick={() => closeItem(tab)}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        {terminalError !== null && (
          <p className="notice" role="alert">
            Could not start a terminal: {terminalError}
          </p>
        )}
        {activeSession !== undefined && <SessionHeader session={activeSession} />}
        {terminalIds.map((id) => (
          <TerminalTab key={id} id={id} active={activeTab?.kind === "terminal" && activeTab.id === id} />
        ))}
        {project !== null && activeTab !== undefined && activeTab.kind !== "terminal" ? (
          <ItemTab
            key={tabKey(activeTab)}
            item={activeTab}
            project={project}
            onStartWork={startWork}
            header={{
              open: !collapsedHeaders.has(tabKey(activeTab)),
              onToggle: () =>
                setCollapsedHeaders((current) => {
                  const next = new Set(current);
                  if (!next.delete(tabKey(activeTab))) next.add(tabKey(activeTab));
                  return next;
                }),
            }}
          />
        ) : (
          activeTab?.kind !== "terminal" && <p className="empty">Select a ticket or map to open it here.</p>
        )}
      </main>
      <aside className="right-side">
        <p className="empty">Explorer and Source Control</p>
      </aside>
      <LiveEventsPanel events={liveEvents} mode={liveEventsPanel} onMode={setLiveEventsPanel} />
      <footer className="statusbar">
        <button
          aria-expanded={liveEventsPanel !== "hidden"}
          onClick={() => setLiveEventsPanel(liveEventsPanel === "hidden" ? lastVisiblePanel.current : "hidden")}
        >
          {liveEventsPanel === "hidden" ? "Show live events" : "Hide live events"}
        </button>
        <span>{project === null ? "No project" : project.path}</span>
      </footer>
    </div>
  );
}
