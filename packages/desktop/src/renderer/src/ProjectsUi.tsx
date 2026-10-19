import { useEffect, useState } from "react";
import type { SessionInfo } from "../../shared/api.ts";
import type { OpenProject, ProjectSummary } from "../../shared/projects.ts";
import { sessionTitle } from "../../shared/work-target.ts";

/** The menu bar's project widget: the current project, and a menu to switch between the open ones. */
export function ProjectWidget({
  current,
  open,
  onSwitch,
  onOpen,
  onAll,
}: {
  current: OpenProject | null;
  open: OpenProject[];
  onSwitch: (path: string) => void;
  onOpen: () => void;
  onAll: () => void;
}) {
  const [shown, setShown] = useState(false);
  // With nothing open the widget is just the way to open a project.
  if (current === null && open.length === 0) {
    return (
      <button className="project-widget" onClick={onOpen}>
        Open project...
      </button>
    );
  }
  const choose = (action: () => void) => () => {
    setShown(false);
    action();
  };
  return (
    <span className="project-menu">
      <button className="project-widget" aria-haspopup="menu" aria-expanded={shown} onClick={() => setShown(!shown)}>
        {current?.name ?? "No project"} ▾
      </button>
      {shown && (
        <div className="project-popup" role="menu" aria-label="Projects">
          {open.map((project) => (
            <button
              key={project.path}
              role="menuitemradio"
              aria-checked={project.path === current?.path}
              title={project.path}
              onClick={choose(() => onSwitch(project.path))}
            >
              {project.name}
            </button>
          ))}
          <button role="menuitem" onClick={choose(onOpen)}>
            Open project...
          </button>
          <button role="menuitem" onClick={choose(onAll)}>
            All projects...
          </button>
        </div>
      )}
    </span>
  );
}

const nextUpLabel = (summary: ProjectSummary): string => {
  const item = summary.nextUp?.item;
  if (item === undefined) return "Nothing recommended";
  return item.kind === "ticket" ? `${item.map}/${item.id}` : `map ${item.map}`;
};

/** Every open project with its tracker, live sessions and next-up item; opens or closes one. */
export function AllProjectsDialog({
  current,
  sessions,
  revision,
  onOpen,
  onClose,
  onCloseProject,
}: {
  current: string | null;
  /** The sessions still running, of all projects, for the confirmation before a project closes. */
  sessions: SessionInfo[];
  /** Changes whenever the open projects or their sessions do, so the list reads again. */
  revision: string;
  onOpen: (path: string) => void;
  onClose: () => void;
  onCloseProject: (path: string) => void;
}) {
  const [summaries, setSummaries] = useState<ProjectSummary[] | null>(null);
  const [closing, setClosing] = useState<string | null>(null);
  useEffect(() => {
    let stale = false;
    void window.dryland.projectSummaries().then((loaded) => {
      if (!stale) setSummaries(loaded);
    });
    return () => {
      stale = true;
    };
  }, [revision]);
  const closingSessions = sessions.filter((session) => session.project === closing);
  return (
    <div className="modal-backdrop">
      <div className="modal projects" role="dialog" aria-modal="true" aria-label="All projects">
        <h2>All projects</h2>
        {summaries === null ? (
          <p className="dim">Reading projects...</p>
        ) : (
          <ul className="project-list">
            {summaries.map((summary) => (
              <li key={summary.path} aria-current={summary.path === current}>
                <div>
                  <strong title={summary.path}>{summary.name}</strong>
                  <span className="dim"> · {summary.tracker ?? "unreadable"}</span>
                </div>
                {summary.error !== null ? (
                  <p className="notice">{summary.error}</p>
                ) : (
                  <div className="dim">
                    {summary.liveSessions === 1 ? "1 live session" : `${summary.liveSessions} live sessions`} · Next up:{" "}
                    {nextUpLabel(summary)}
                  </div>
                )}
                <div className="modal-actions">
                  <button onClick={() => onOpen(summary.path)}>Open {summary.name}</button>
                  <button aria-label={`Close ${summary.name}`} onClick={() => setClosing(summary.path)}>
                    Close
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {closing !== null && (
          <div className="notice" role="alertdialog" aria-label="Close project">
            <p>
              Close {summaries?.find((summary) => summary.path === closing)?.name ?? closing}?
              {closingSessions.length > 0
                ? " Its running sessions stop; their claims are kept, so they can be resumed:"
                : " No session is running in it."}
            </p>
            {closingSessions.length > 0 && (
              <ul aria-label="Sessions that stop">
                {closingSessions.map((session) => (
                  <li key={session.id}>{sessionTitle(session)}</li>
                ))}
              </ul>
            )}
            <div className="modal-actions">
              <button onClick={() => setClosing(null)}>Cancel</button>
              <button
                className="primary"
                onClick={() => {
                  onCloseProject(closing);
                  setClosing(null);
                }}
              >
                Close project
              </button>
            </div>
          </div>
        )}
        <div className="modal-actions">
          <button onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
