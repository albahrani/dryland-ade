import { useEffect, useState } from "react";
import type { AppState, ProjectView } from "../../shared/api.ts";
import { Legend } from "./Legend.tsx";
import { TicketsView } from "./TicketsView.tsx";

type ActivityView = "tickets" | "maps" | "sessions";

const ACTIVITIES: { id: ActivityView; label: string; glyph: string }[] = [
  { id: "tickets", label: "Tickets", glyph: "☰" },
  { id: "maps", label: "Maps", glyph: "◈" },
  { id: "sessions", label: "Sessions", glyph: "▶" },
];

function Sidebar({ view, project }: { view: ActivityView; project: ProjectView | null }) {
  if (project === null) return <p className="empty">Open a git repo to see its tickets.</p>;
  if (!project.tree.ok) {
    return (
      <div className="notice" role="alert">
        <p>{project.tree.message}</p>
        <p>{project.tree.nextAction}</p>
      </div>
    );
  }
  if (view === "tickets") return <TicketsView tree={project.tree.tree} />;
  return <p className="empty">The {view} view arrives in a later ticket.</p>;
}

export function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [activity, setActivity] = useState<ActivityView>("tickets");
  const [panelOpen, setPanelOpen] = useState(true);

  useEffect(() => {
    void window.dryland.getState().then(setState);
    return window.dryland.onProjectChanged((project) => setState((current) => current && { ...current, project }));
  }, []);

  if (state === null) return null;
  const { project, legendDismissed } = state;
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
        <Sidebar view={activity} project={project} />
      </aside>
      <main className="editor">
        <p className="empty">Select a ticket to open it here.</p>
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
