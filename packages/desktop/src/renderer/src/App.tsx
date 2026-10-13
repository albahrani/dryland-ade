import { useEffect, useState } from "react";
import type { AppState, ProjectView } from "../../shared/api.ts";
import { activeItem, closeTab, focusTab, type ItemRef, openTab, tabKey, type TabsState } from "../../shared/tabs.ts";
import { ItemTab } from "./ItemTab.tsx";
import { Legend } from "./Legend.tsx";
import { MapsView } from "./MapsView.tsx";
import { TicketsView } from "./TicketsView.tsx";

type ActivityView = "tickets" | "maps" | "sessions";

const ACTIVITIES: { id: ActivityView; label: string; glyph: string }[] = [
  { id: "tickets", label: "Tickets", glyph: "☰" },
  { id: "maps", label: "Maps", glyph: "◈" },
  { id: "sessions", label: "Sessions", glyph: "▶" },
];

function tabLabel(ref: ItemRef): string {
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

  useEffect(() => {
    void window.dryland.getState().then(setState);
    return window.dryland.onProjectChanged((project) => setState((current) => current && { ...current, project }));
  }, []);

  if (state === null) return null;
  const { project, legendDismissed, tabs } = state;
  const setTabs = (next: TabsState) => {
    setState({ ...state, tabs: next });
    void window.dryland.saveTabs(next);
  };
  const activeTab = activeItem(tabs);
  const dismissLegend = () => {
    setState({ ...state, legendDismissed: true });
    void window.dryland.dismissLegend();
  };

  return (
    <div className="shell">
      <header className="menubar">
        <button className="project-widget" onClick={() => void window.dryland.openProject().then(setState)}>
          {project === null ? "Open project..." : project.name}
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
                  {tabLabel(tab)}
                </button>
                <button aria-label={`Close ${tabLabel(tab)}`} onClick={() => setTabs(closeTab(tabs, tabKey(tab)))}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        {project !== null && activeTab !== undefined ? (
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
          <p className="empty">Select a ticket or map to open it here.</p>
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
