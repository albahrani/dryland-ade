import { useEffect, useRef, useState } from "react";
import type { AppState, ProjectView } from "../../shared/api.ts";
import { activeItem, closeTab, focusTab, type ItemRef, openTab, tabKey, type TabsState } from "../../shared/tabs.ts";
import { ItemTab } from "./ItemTab.tsx";
import { Legend } from "./Legend.tsx";
import { MapsView } from "./MapsView.tsx";
import { TerminalTab } from "./TerminalTab.tsx";
import { disposeTerminal, getOrCreateTerminal, routeTerminalEvents } from "./terminals.ts";
import { TicketsView } from "./TicketsView.tsx";

type ActivityView = "tickets" | "maps" | "sessions";

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

export function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [activity, setActivity] = useState<ActivityView>("tickets");
  const [panelOpen, setPanelOpen] = useState(true);
  // Tabs whose details header the user collapsed; not persisted.
  const [collapsedHeaders, setCollapsedHeaders] = useState<Set<string>>(new Set());
  // Titles of terminals, numbered in the order they were opened.
  const [terminalTitles, setTerminalTitles] = useState<ReadonlyMap<string, string>>(new Map());
  const terminalsOpened = useRef(0);
  const [terminalError, setTerminalError] = useState<string | null>(null);

  useEffect(() => {
    void window.dryland.getState().then(setState);
    const stopProject = window.dryland.onProjectChanged((project) =>
      setState((current) => current && { ...current, project }),
    );
    const stopTerminals = routeTerminalEvents();
    return () => {
      stopProject();
      stopTerminals();
    };
  }, []);

  if (state === null) return null;
  const { project, legendDismissed, tabs } = state;
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
    setState(next);
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
    // Registered before anything else runs, so the shell's first output is not dropped.
    getOrCreateTerminal(id);
    terminalsOpened.current += 1;
    const title = `Terminal ${terminalsOpened.current}`;
    setTerminalTitles((current) => new Map(current).set(id, title));
    setState((current) => current && { ...current, tabs: openTab(current.tabs, { kind: "terminal", id }) });
  };
  const activeTab = activeItem(tabs);
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
        {terminalIds.map((id) => (
          <TerminalTab key={id} id={id} active={activeTab?.kind === "terminal" && activeTab.id === id} />
        ))}
        {project !== null && activeTab !== undefined && activeTab.kind !== "terminal" ? (
          <ItemTab
            key={tabKey(activeTab)}
            item={activeTab}
            project={project}
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
      <section className="panel" hidden={!panelOpen} aria-label="Live events">
        <p className="empty">Live events appear here.</p>
      </section>
      <footer className="statusbar">
        <button onClick={() => setPanelOpen(!panelOpen)} aria-expanded={panelOpen}>
          Live events
        </button>
        <span>{project === null ? "No project" : project.path}</span>
      </footer>
    </div>
  );
}
