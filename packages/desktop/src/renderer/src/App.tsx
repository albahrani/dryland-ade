import type { LiveEvent, TicketRef, TreeTicket } from "@dryland/core";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import type {
  AppState,
  LiveEventsPanelMode,
  MenuCommand,
  ProjectView,
  ResumeMode,
  SessionInfo,
} from "../../shared/api.ts";
import {
  mapSessionCounts,
  mapTitle,
  pausedItems,
  selectedSession,
  sessionCounts,
  sessionItemTitle,
  type MapSessionCounts,
  type SessionsLayout,
  splitSessions,
  type StateSince,
  trackStateSince,
} from "../../shared/sessions-view.ts";
import type { AgentHooksAction } from "../../shared/agent-hooks.ts";
import { stateLabel } from "../../shared/session-meta.ts";
import { AllProjectsDialog, ProjectWidget, TrackerWidget } from "./ProjectsUi.tsx";
import { projectSessions } from "../../shared/projects.ts";
import { SessionsView } from "./SessionsView.tsx";
import { AboutDialog } from "./AboutDialog.tsx";
import { CompatDialog } from "./CompatDialog.tsx";
import { SkillSetupPanel } from "./SkillSetupPanel.tsx";
import { sessionTitle } from "../../shared/work-target.ts";
import {
  activeItem,
  closeTab,
  focusTab,
  type ItemRef,
  openTab,
  parseTicketKey,
  replaceTab,
  savedTabs,
  type SessionRef,
  tabKey,
  type TabsState,
  ticketKey,
} from "../../shared/tabs.ts";
import { QuitDialog } from "./QuitDialog.tsx";
import type { QuitRequest } from "../../shared/quit.ts";
import { ConfirmWrite, type PendingWrite } from "./ConfirmWrite.tsx";
import { Explorer } from "./Explorer.tsx";
import { SourceControl } from "./SourceControl.tsx";
import { DiffTab, FileTab } from "./FileTab.tsx";
import type { RootHint } from "../../shared/explorer.ts";
import { baseName, dirName } from "../../shared/paths.ts";
import { ItemTab, type ResumeAllHandler, type ResumeHandler, type StartWorkHandler } from "./ItemTab.tsx";
import { type PausedSession, pausedSessions } from "../../shared/paused-session.ts";
import { NewMapDialog, NewScratchDialog, NewTicketDialog } from "./NewDialogs.tsx";
import { Legend } from "./Legend.tsx";
import { SettingsDialog } from "./SettingsDialog.tsx";
import { LiveEventsPanel } from "./LiveEventsPanel.tsx";
import { PanelResizer } from "./PanelResizer.tsx";
import { PANEL_SIDES, type PanelSide } from "../../shared/panel-widths.ts";
import { MapsView } from "./MapsView.tsx";
import { TerminalTab } from "./TerminalTab.tsx";
import {
  disposeTerminal,
  endTerminal,
  existingTerminal,
  getOrCreateTerminal,
  lastLine,
  routeTerminalEvents,
} from "./terminals.ts";
import { ConfirmStop, type SessionHandlers, UnseenMark } from "./SessionControls.tsx";
import { stopNeedsConfirmation } from "../../shared/stop-session.ts";
import { PausedBadge, SessionBadge } from "./status.tsx";
import { TicketsView } from "./TicketsView.tsx";
import { type TicketSession, ticketSessions } from "../../shared/session-meta.ts";
import { type ActionSource, commandLine, type TicketAction, trackerArgs } from "../../shared/tracker-actions.ts";

type ActivityView = "tickets" | "maps" | "sessions";

/** The panel keeps the newest events only, so a long day does not grow the window's memory without bound. */
const MAX_LIVE_EVENTS = 500;

const ACTIVITIES: { id: ActivityView; label: string; glyph: string }[] = [
  { id: "tickets", label: "Tickets", glyph: "☰" },
  { id: "maps", label: "Maps", glyph: "◈" },
  { id: "sessions", label: "Sessions", glyph: "▶" },
];

function tabLabel(
  ref: ItemRef,
  terminalTitles: ReadonlyMap<string, string>,
  paused: ReadonlyMap<string, PausedSession>,
): string {
  if (ref.kind === "terminal") return terminalTitles.get(ref.id) ?? "Terminal";
  // A restored session tab reads as the terminal it becomes, not as the ticket's own tab.
  if (ref.kind === "session") return `${paused.get(ticketKey(ref))?.agent ?? "Session"} ${ticketKey(ref)}`;
  if (ref.kind === "file") return baseName(ref.path);
  if (ref.kind === "diff") return `${baseName(ref.path)} (diff)`;
  return ref.kind === "map" ? ref.name : `${ref.map}/${ref.id}`;
}

/** Which worktree the Explorer shows for the focused tab: a session's own, a ticket's, a file's; else the main checkout. */
function explorerHint(active: ItemRef | undefined, sessions: ReadonlyMap<string, SessionInfo>): RootHint {
  if (active === undefined || active.kind === "map") return null;
  if (active.kind === "file" || active.kind === "diff") return { kind: "worktree", path: active.root };
  if (active.kind === "terminal") {
    const session = sessions.get(active.id);
    return session === undefined ? null : { kind: "worktree", path: session.worktree.path };
  }
  return { kind: "ticket", ticket: { map: active.map, id: active.id } };
}

function Sidebar({
  view,
  project,
  tabs,
  ticketSessions,
  paused,
  mapCounts,
  onOpen,
  onRelease,
  onStartWork,
  onDialog,
  onShowSession,
  sessionsView,
}: {
  view: ActivityView;
  project: ProjectView | null;
  tabs: TabsState;
  ticketSessions: ReadonlyMap<string, TicketSession>;
  paused: ReadonlyMap<string, PausedSession>;
  mapCounts: (map: string) => MapSessionCounts;
  onOpen: (ref: ItemRef) => void;
  onRelease: (ticket: TreeTicket) => void;
  onStartWork: StartWorkHandler;
  onDialog: (dialog: MenuCommand) => void;
  /** Shows the session a Next-up marker points at, by session id. */
  onShowSession: (sessionId: string) => void;
  sessionsView: ReactNode;
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
  const { tree, nextUp, staleClaims } = project.tree;
  if (view === "tickets")
    return (
      <TicketsView
        tree={tree}
        activeKey={tabs.active}
        sessions={ticketSessions}
        paused={paused}
        nextUp={nextUp}
        mapCounts={mapCounts}
        staleClaims={staleClaims}
        onOpen={onOpen}
        onRelease={onRelease}
        onShowSession={onShowSession}
        onNewTicket={() => onDialog("new-ticket")}
      />
    );
  if (view === "maps") {
    const active = activeItem(tabs);
    return (
      <MapsView
        tree={tree}
        activeMap={active?.kind === "map" ? active.name : null}
        nextUp={nextUp}
        mapCounts={mapCounts}
        onOpen={onOpen}
        onContinue={(map, agentId, skill) => onStartWork({ kind: "map", map }, agentId, skill)}
        onNewMap={() => onDialog("new-map")}
      />
    );
  }
  return sessionsView;
}

/** What a session tab says about its session: agent, ticket, worktree and id, as recorded at spawn; and Stop. */
function SessionHeader({ session, live, onStop }: { session: SessionInfo; live: boolean; onStop: () => void }) {
  return (
    <dl className="session-header" aria-label="Session">
      <div>
        <dt>Agent</dt>
        <dd>{session.agent.name}</dd>
      </div>
      {session.ticket !== null ? (
        <div>
          <dt>Ticket</dt>
          <dd>{ticketKey(session.ticket)}</dd>
        </div>
      ) : (
        <div>
          <dt>Map</dt>
          <dd>{session.map ?? "new map"}</dd>
        </div>
      )}
      <div>
        <dt>Worktree</dt>
        <dd title={session.worktree.path}>{session.worktree.branch}</dd>
      </div>
      <div>
        <dt>Session</dt>
        <dd title={session.id}>{session.id.slice(0, 8)}</dd>
      </div>
      {live && <button onClick={onStop}>Stop session</button>}
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
  // A write from a general button, waiting for the user to confirm it.
  const [pending, setPending] = useState<(PendingWrite & { action: TicketAction }) | null>(null);
  // A session start waiting for the user to confirm the write to the Agent CLI's own config that it begins with.
  const [pendingStart, setPendingStart] = useState<(PendingWrite & { start: () => Promise<void> }) | null>(null);
  // What the last tracker write or session start reported: its error, or the warnings it ran with.
  const [notice, setNotice] = useState<string | null>(null);
  const [quitRequest, setQuitRequest] = useState<QuitRequest | null>(null);
  // The New ticket or New map dialog, while it is open.
  const [dialog, setDialog] = useState<MenuCommand | "all-projects" | null>(null);
  // The setup (by project and fingerprint) whose Compatibility dialog was skipped; skipping asks again once it changes.
  const [skippedSetup, setSkippedSetup] = useState<string | null>(null);
  /** Counts installs and removals of the CLI hooks, so the Agent CLIs tab reads them again. */
  const [hooksRevision, setHooksRevision] = useState(0);
  // The tabs each project had when the user left it, terminals included, so coming back finds them as they were.
  const projectTabs = useRef(new Map<string, TabsState>());
  // A session waiting for the user to confirm it should stop.
  const [stopping, setStopping] = useState<SessionInfo | null>(null);
  // When each session entered its state, as this window saw it; for the Sessions view's ages.
  const [stateSince, setStateSince] = useState<StateSince>(new Map());
  // The clock the Sessions view's ages and last output lines refresh with, ticking while the view shows.
  const [now, setNow] = useState(Date.now);
  // Counts the changes the Explorer's watched directories report; open file tabs and the tree read again on each.
  const [explorerRevision, setExplorerRevision] = useState(0);
  // A worktree the user picked from Source Control's unlinked branches, for as long as the same tab stays focused.
  const [pinned, setPinned] = useState<{ tab: string | null; path: string } | null>(null);

  const sessionStatesNow = state?.sessionStates;
  useEffect(() => {
    if (sessionStatesNow === undefined) return;
    setStateSince((previous) => trackStateSince(previous, [...sessions.values()], sessionStatesNow, Date.now()));
  }, [sessions, sessionStatesNow]);
  useEffect(() => {
    if (activity !== "sessions") return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [activity]);

  // The main process marks output of every other session unseen.
  const viewedTerminal = state === null ? undefined : activeItem(state.tabs);
  const viewedTerminalId = viewedTerminal?.kind === "terminal" ? viewedTerminal.id : null;
  useEffect(() => window.dryland.viewTerminal(viewedTerminalId), [viewedTerminalId]);

  // Session tabs are saved by their ticket, so a restart brings them back (as tabs that resume when shown).
  const tabsNow = state?.tabs;
  useEffect(() => {
    if (tabsNow === undefined) return;
    void window.dryland.saveTabs(savedTabs(tabsNow, (terminalId) => sessions.get(terminalId)?.ticket ?? null));
  }, [tabsNow, sessions]);

  // A restored session tab brings its session up the first time it is shown; the handler is the latest render's.
  const restoreSession = useRef<(ref: SessionRef) => void>(() => undefined);
  const shown = state === null ? undefined : activeItem(state.tabs);
  const shownSession = shown?.kind === "session" ? shown : undefined;
  const treeReady = state?.project?.tree.ok === true;
  useEffect(() => {
    if (shownSession !== undefined && treeReady) restoreSession.current(shownSession);
    // Once per tab shown, once the project has loaded: the tab is replaced by what it restores.
  }, [shownSession === undefined ? null : tabKey(shownSession), treeReady]);

  useEffect(() => {
    void window.dryland.getState().then((loaded) => {
      setState(loaded);
      // After a reload the main process still knows the sessions this app started; some may already have arrived.
      setSessions((current) => new Map([...loaded.sessions.map((s) => [s.terminalId, s] as const), ...current]));
    });
    const stopStarted = window.dryland.onSessionsStarted((started) =>
      setSessions((current) => new Map([...current, ...started.map((s) => [s.terminalId, s] as const)])),
    );
    const stopNotice = window.dryland.onNotice(setNotice);
    const stopQuit = window.dryland.onQuitRequest(setQuitRequest);
    const stopProject = window.dryland.onProjectChanged((project) =>
      setState((current) => current && { ...current, project }),
    );
    const stopTerminals = routeTerminalEvents();
    const stopSettings = window.dryland.onSettingsChanged((settings) =>
      setState((current) => current && { ...current, settings }),
    );
    const stopSessionStates = window.dryland.onSessionStates((sessionStates) =>
      setState((current) => current && { ...current, sessionStates }),
    );
    const stopUnseen = window.dryland.onUnseenSessions((unseenSessions) =>
      setState((current) => current && { ...current, unseenSessions }),
    );
    const stopLive = window.dryland.onLiveEvent((event) =>
      setLiveEvents((current) => [...current.slice(1 - MAX_LIVE_EVENTS), event]),
    );
    const stopMenu = window.dryland.onMenuCommand(setDialog);
    const stopExplorer = window.dryland.onExplorerChanged(() => setExplorerRevision((revision) => revision + 1));
    return () => {
      stopExplorer();
      stopStarted();
      stopNotice();
      stopQuit();
      stopMenu();
      stopProject();
      stopTerminals();
      stopLive();
      stopSessionStates();
      stopUnseen();
      stopSettings();
    };
  }, []);

  if (state === null) return null;
  const {
    project,
    legendDismissed,
    tabs,
    liveEventsPanel,
    panelWidths,
    panelFolded,
    sessionStates,
    unseenSessions,
    settings,
  } = state;
  // Sessions of other projects keep running and reporting; the views show the current project's.
  const everySession = [...sessions.values()];
  const projectOnly = projectSessions(everySession, project?.path ?? null);
  const sessionState = (session: SessionInfo) => sessionStates[session.id] ?? "launched";
  const isUnseen = (session: SessionInfo) => unseenSessions.includes(session.id);
  const ticketSessionMap = ticketSessions(projectOnly, sessionStates);
  const pausedMap = pausedSessions(project?.tree.ok ? project.tree.pausedClaims : {}, projectOnly, sessionStates);
  if (liveEventsPanel !== "hidden") lastVisiblePanel.current = liveEventsPanel;
  const setLiveEventsPanel = (mode: LiveEventsPanelMode) => {
    setState({ ...state, liveEventsPanel: mode });
    void window.dryland.setLiveEventsPanel(mode);
  };
  const resizePanel = (side: PanelSide, width: number) =>
    setState({ ...state, panelWidths: { ...panelWidths, [side]: width } });
  const togglePanel = (side: PanelSide) => {
    const next = { ...panelFolded, [side]: !panelFolded[side] };
    setState({ ...state, panelFolded: next });
    void window.dryland.setPanelFolded(next);
  };
  const savePanelWidth = (side: PanelSide, width: number) =>
    void window.dryland.setPanelWidths({ ...panelWidths, [side]: width });
  const setTabs = (next: TabsState) => {
    setState({ ...state, tabs: next });
  };
  const closeItem = (ref: ItemRef) => {
    if (ref.kind === "terminal") {
      // A plain terminal ends; a session is only hidden, and its output stays in the main process for replay.
      // A session started by hand is its terminal's shell: it ends with the tab.
      const session = sessions.get(ref.id);
      if (session === undefined || session.manual === true) window.dryland.closeTerminal(ref.id);
      disposeTerminal(ref.id);
    }
    setTabs(closeTab(tabs, tabKey(ref)));
  };
  /** Shows the state of another project, with the tabs it had when the user left it. */
  const showProjectState = (next: AppState) => {
    if (project !== null) projectTabs.current.set(project.path, tabs);
    const remembered = next.project === null ? undefined : projectTabs.current.get(next.project.path);
    setState({ ...next, tabs: remembered ?? next.tabs });
  };
  const openProject = async () => showProjectState(await window.dryland.openProject());
  const switchProject = async (path: string) => {
    if (path !== project?.path) showProjectState(await window.dryland.switchProject(path));
  };
  const closeProject = async (path: string) => {
    projectTabs.current.delete(path);
    const next = await window.dryland.closeProject(path);
    // Its sessions and terminals ended; drop their views.
    for (const session of everySession) {
      if (session.project !== path) continue;
      disposeTerminal(session.terminalId);
    }
    setSessions((current) => new Map([...current].filter(([, session]) => session.project !== path)));
    setState({
      ...next,
      tabs: next.project === null ? next.tabs : (projectTabs.current.get(next.project.path) ?? next.tabs),
    });
  };
  /**
   * Shows terminal `id` in a new, focused tab, or in place of the tab `replacing`; registered first, so its first
   * output is not dropped.
   */
  const showTerminal = (id: string, title: string, replacing?: string) => {
    getOrCreateTerminal(id);
    setTerminalTitles((current) => new Map(current).set(id, title));
    const ref = { kind: "terminal" as const, id };
    setState(
      (current) =>
        current && {
          ...current,
          tabs: replacing === undefined ? openTab(current.tabs, ref) : replaceTab(current.tabs, replacing, ref),
        },
    );
  };
  /** The setup the skipped dialog was for: skipping asks again once the project or its setup changes. */
  const setupKey = project?.tree.ok ? `${project.path}|${project.tree.skillSetup.fingerprint}` : null;
  /** Starts work; the first start with a CLI that keeps its hooks in the user's own config asks before it writes there. */
  const startWork: StartWorkHandler = async (target, agentId, skill) => {
    if (!settings.dontAsk["user-config"]) {
      const text = await window.dryland.pendingUserConfigWrite(agentId);
      if (text !== null) {
        setPendingStart({
          type: "user-config",
          text,
          command: commandLine(["doctor", "--install-hooks"]),
          start: () => launchWork(target, agentId, skill),
        });
        return;
      }
    }
    await launchWork(target, agentId, skill);
  };
  /** Installs or removes what Dryland keeps in the user's CLI config; the first install asks like a first start does. */
  const changeHooks = async (agentId: string, action: AgentHooksAction) => {
    const run = async () => {
      const change = await window.dryland.changeAgentHooks(agentId, action);
      if (change !== null && change.warnings.length > 0) setNotice(change.warnings.join(" "));
      setHooksRevision((revision) => revision + 1);
    };
    if (action === "install" && !settings.dontAsk["user-config"]) {
      const text = await window.dryland.pendingUserConfigWrite(agentId);
      if (text !== null) {
        setPendingStart({ type: "user-config", text, command: commandLine(["doctor", "--install-hooks"]), start: run });
        return;
      }
    }
    await run();
  };
  const launchWork: StartWorkHandler = async (target, agentId, skill) => {
    setTerminalError(null);
    const result = await window.dryland.startWork(target, agentId, skill);
    if (!result.ok) {
      setTerminalError(`${result.message} ${result.nextAction}`);
      return;
    }
    const { session, warnings } = result;
    setNotice(warnings.length === 0 ? null : warnings.join(" "));
    setSessions((current) => new Map(current).set(session.terminalId, session));
    showTerminal(session.terminalId, sessionTitle(session));
  };
  /** Resumes a ticket's session (a hidden one until shown); `null` with the error shown when it could not. */
  const launchResume = async (ticket: TicketRef, mode: ResumeMode): Promise<SessionInfo | null> => {
    setTerminalError(null);
    const result = await window.dryland.resumeSession(ticket, mode);
    if (!result.ok) {
      setTerminalError(`${result.message} ${result.nextAction}`);
      return null;
    }
    const { session, warnings } = result;
    setNotice(warnings.length === 0 ? null : warnings.join(" "));
    setSessions((current) => new Map(current).set(session.terminalId, session));
    return session;
  };
  const resumeSession: ResumeHandler = async (ticket, mode) => {
    const session = await launchResume(ticket, mode);
    if (session !== null) showTerminal(session.terminalId, sessionTitle(session));
  };
  const resumeAllPaused = async (map: string | null) => {
    const { warnings } = await window.dryland.resumeAll(map);
    setNotice(warnings.length === 0 ? null : warnings.join(" "));
  };
  const resumeAllOnMap: ResumeAllHandler = (map) => resumeAllPaused(map);
  /** Resumes one paused session, hidden: it moves from the Paused pane to the Hidden one. */
  const resumeHidden = async (ticket: TicketRef) => {
    await launchResume(ticket, "resume");
  };
  /** Turns a restored session tab into what it stands for: the running session, the resumed one, or its ticket. */
  restoreSession.current = (ref) => {
    const key = tabKey(ref);
    const toTicket = () =>
      setState(
        (current) =>
          current && { ...current, tabs: replaceTab(current.tabs, key, { kind: "ticket", map: ref.map, id: ref.id }) },
      );
    const live = projectSessions([...sessions.values()], state?.project?.path ?? null)
      .filter((s) => s.ticket !== null && ticketKey(s.ticket) === ticketKey(ref) && sessionState(s) !== "ended")
      .at(-1);
    if (live !== undefined) {
      // Resumed hidden (at start or by Resume all): its output is replayed into the tab's new view.
      void window.dryland.replayTerminal(live.terminalId).then((output) => {
        if (output === null) return toTicket();
        if (existingTerminal(live.terminalId) === undefined) {
          getOrCreateTerminal(live.terminalId).term.write(output);
        }
        showTerminal(live.terminalId, sessionTitle(live), key);
      });
    } else if (pausedMap.has(ticketKey(ref))) {
      void launchResume({ map: ref.map, id: ref.id }, "resume").then((session) =>
        session === null ? toTicket() : showTerminal(session.terminalId, sessionTitle(session), key),
      );
    } else {
      toTicket();
    }
  };
  /** The last line the newest stopped session on a ticket printed, while this run still holds its terminal. */
  const pausedLastLine = (key: string): string | null => {
    const stopped = projectOnly.filter((s) => s.ticket !== null && ticketKey(s.ticket) === key);
    const newest = stopped[stopped.length - 1];
    return newest === undefined ? null : lastLine(newest.terminalId);
  };
  /** Shows a session in its tab; a hidden one gets a new tab with the output it printed meanwhile. */
  const showSession = async (session: SessionInfo) => {
    const ref = { kind: "terminal" as const, id: session.terminalId };
    if (tabs.open.some((tab) => tabKey(tab) === tabKey(ref))) {
      setTabs(focusTab(tabs, tabKey(ref)));
      return;
    }
    const output = await window.dryland.replayTerminal(session.terminalId);
    if (output === null) return;
    // In the same task as the reply, so output the main process sends after it reaches this terminal, in order.
    getOrCreateTerminal(session.terminalId).term.write(output);
    showTerminal(session.terminalId, sessionTitle(session));
  };
  const stopSession = (session: SessionInfo) => {
    setStopping(null);
    // Only a view still open shows it; a hidden session has none.
    void window.dryland.stopSession(session.id).then(() => endTerminal(session.terminalId, "[session stopped]"));
  };
  const requestStop = (session: SessionInfo) => {
    if (stopNeedsConfirmation(settings.stopConfirmation, sessionState(session), isUnseen(session)))
      setStopping(session);
    else stopSession(session);
  };
  const sessionHandlers: SessionHandlers = {
    state: sessionState,
    unseen: isUnseen,
    show: (session) => void showSession(session),
    stop: requestStop,
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
  /** Runs an action through `dryland` and reports its error or warnings; resolves with whether it made the change. */
  const runAction = async (action: TicketAction): Promise<boolean> => {
    setNotice(null);
    const result = await window.dryland.runTicketAction(action, settings.autoCommit);
    if (!result.ok) setNotice(`${result.message} ${result.nextAction}`);
    else if (result.warnings.length > 0) setNotice(result.warnings.join(" "));
    return result.ok;
  };
  /** A ticket's own actions run at once; a general button asks first, unless the user said not to (ADR 0003). */
  const requestAction = async (action: TicketAction, source: ActionSource): Promise<boolean> => {
    if (source === "ticket" || settings.dontAsk["tracker-metadata"]) return runAction(action);
    setPending({
      action,
      type: "tracker-metadata",
      text:
        action.kind === "create"
          ? `Create ticket "${action.ticket.title}" on map ${action.ticket.map}?`
          : action.kind === "release"
            ? `Release the claim on ${ticketKey(action.ticket)}? Its status goes back to what it was before.`
            : `Change ${ticketKey(action.ticket)}?`,
      command: commandLine(trackerArgs(action, settings.autoCommit)),
    });
    return false;
  };
  const confirmPending = (dontAskAgain: boolean) => {
    if (pending === null) return;
    setPending(null);
    if (dontAskAgain) {
      setState({ ...state, settings: { ...settings, dontAsk: { ...settings.dontAsk, [pending.type]: true } } });
      void window.dryland.dontAskAgain(pending.type);
    }
    void runAction(pending.action);
  };
  const activeTab = activeItem(tabs);
  const worktreeHint: RootHint =
    pinned !== null && pinned.tab === tabs.active
      ? { kind: "worktree", path: pinned.path }
      : explorerHint(activeTab, sessions);
  const activeDocument = activeTab?.kind === "ticket" || activeTab?.kind === "map" ? activeTab : undefined;
  const activeSession = activeTab?.kind === "terminal" ? sessions.get(activeTab.id) : undefined;
  const allSessions = projectOnly;
  const { hidden: hiddenSessions, open: openSessions } = splitSessions(allSessions, sessionStates, tabs.open);
  const selected = selectedSession(activeTab, allSessions, sessionStates);
  const liveWaiting = allSessions.filter((session) => sessionState(session) === "waiting").length;
  const tree = project?.tree.ok ? project.tree.tree : null;
  const pausedList = pausedItems(Object.fromEntries([...pausedMap]));
  const mapCounts = (map: string) =>
    mapSessionCounts(map, allSessions, sessionStates, Object.fromEntries([...pausedMap]), tabs.open);
  const setSessionsLayout = (layout: SessionsLayout, save: boolean) => {
    setState({ ...state, sessionsLayout: layout });
    if (save) void window.dryland.saveSessionsLayout(layout);
  };
  const showSessionById = (sessionId: string) => {
    const session = allSessions.find((s) => s.id === sessionId);
    if (session !== undefined) void showSession(session);
  };
  const terminalIds = tabs.open.flatMap((tab) => (tab.kind === "terminal" ? [tab.id] : []));
  const dismissLegend = () => {
    setState({ ...state, legendDismissed: true });
    void window.dryland.dismissLegend();
  };

  return (
    <div
      className={`shell${panelFolded.left ? " left-folded" : ""}${panelFolded.right ? " right-folded" : ""}`}
      style={
        {
          "--left-width": panelFolded.left ? "0px" : `${panelWidths.left}px`,
          "--right-width": panelFolded.right ? "0px" : `${panelWidths.right}px`,
        } as CSSProperties
      }
    >
      <header className="menubar">
        <ProjectWidget
          current={project === null ? null : { path: project.path, name: project.name }}
          open={state.openProjects}
          onSwitch={(path) => void switchProject(path)}
          onOpen={() => void openProject()}
          onAll={() => setDialog("all-projects")}
        />
        {project !== null && <TrackerWidget info={project.tracker} onError={setNotice} />}
        <button className="project-widget" disabled={project === null} onClick={() => void newTerminal()}>
          New terminal
        </button>
      </header>
      <nav className="activitybar" aria-label="Activity bar">
        {ACTIVITIES.map(({ id, label, glyph }) => {
          const badge = id === "sessions" && liveWaiting > 0 ? liveWaiting : null;
          return (
            <button
              key={id}
              title={badge === null ? label : `${label} (${badge} waiting)`}
              aria-label={label}
              aria-pressed={activity === id}
              onClick={() => setActivity(id)}
            >
              {glyph}
              {badge !== null && <span className="activity-badge">{badge}</span>}
            </button>
          );
        })}
      </nav>
      <aside className="sidebar">
        {!legendDismissed && <Legend onDismiss={dismissLegend} />}
        {project?.tree.ok && (
          <SkillSetupPanel report={project.tree.skillSetup} compatibility={project.tree.compatibility} />
        )}
        <Sidebar
          view={activity}
          project={project}
          tabs={tabs}
          ticketSessions={ticketSessionMap}
          paused={pausedMap}
          mapCounts={mapCounts}
          onOpen={(ref) => setTabs(openTab(tabs, ref))}
          onRelease={(ticket) =>
            void requestAction({ kind: "release", ticket: { map: ticket.map, id: ticket.id } }, "general-button")
          }
          onStartWork={startWork}
          onDialog={setDialog}
          onShowSession={showSessionById}
          sessionsView={
            <SessionsView
              hidden={hiddenSessions}
              paused={pausedList}
              open={openSessions}
              states={sessionStates}
              since={stateSince}
              now={now}
              selected={selected?.id ?? null}
              layout={state.sessionsLayout}
              lookups={{
                title: (session) => sessionItemTitle(tree, session),
                mapTitle: (name) => mapTitle(tree, name),
                lastLine: (session) => lastLine(session.terminalId),
              }}
              handlers={sessionHandlers}
              pausedHandlers={{
                open: (ticket) => setTabs(openTab(tabs, { kind: "ticket", ...ticket })),
                resume: (ticket) => void resumeHidden(ticket),
                resumeAll: () => void resumeAllPaused(null),
              }}
              onLayout={setSessionsLayout}
            />
          }
        />
      </aside>
      <main className="editor">
        {tabs.open.length > 0 && (
          <div className="tabbar" role="tablist" aria-label="Open items">
            {tabs.open.map((tab) => {
              const session = tab.kind === "terminal" ? sessions.get(tab.id) : undefined;
              const paused =
                tab.kind === "ticket" || tab.kind === "session" ? pausedMap.get(ticketKey(tab)) : undefined;
              return (
                <span key={tabKey(tab)} className="tab" aria-current={tabKey(tab) === tabs.active}>
                  {paused !== undefined && <PausedBadge agent={paused.agent} was={paused.was} />}
                  {session !== undefined && <SessionBadge agent={session.agent.name} state={sessionState(session)} />}
                  {session !== undefined && isUnseen(session) && <UnseenMark />}
                  <button
                    role="tab"
                    aria-selected={tabKey(tab) === tabs.active}
                    onClick={() => setTabs(focusTab(tabs, tabKey(tab)))}
                  >
                    {tabLabel(tab, terminalTitles, pausedMap)}
                  </button>
                  <button
                    aria-label={`Close ${tabLabel(tab, terminalTitles, pausedMap)}`}
                    onClick={() => closeItem(tab)}
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        )}
        {terminalError !== null && (
          <p className="notice" role="alert">
            Could not start a terminal: {terminalError}
          </p>
        )}
        {notice !== null && (
          <p className="notice" role="alert">
            {notice}
            <button aria-label="Dismiss" onClick={() => setNotice(null)}>
              ×
            </button>
          </p>
        )}
        {activeSession !== undefined && (
          <SessionHeader
            session={activeSession}
            live={sessionState(activeSession) !== "ended"}
            onStop={() => requestStop(activeSession)}
          />
        )}
        {terminalIds.map((id) => (
          <TerminalTab key={id} id={id} active={activeTab?.kind === "terminal" && activeTab.id === id} />
        ))}
        {activeTab?.kind === "session" && <p className="empty">Resuming {ticketKey(activeTab)}...</p>}
        {activeTab?.kind === "file" && <FileTab key={tabKey(activeTab)} item={activeTab} revision={explorerRevision} />}
        {activeTab?.kind === "diff" && <DiffTab key={tabKey(activeTab)} item={activeTab} revision={explorerRevision} />}
        {project !== null && activeDocument !== undefined ? (
          <ItemTab
            key={tabKey(activeDocument)}
            item={activeDocument}
            project={project}
            sessions={projectOnly}
            sessionHandlers={sessionHandlers}
            paused={pausedMap}
            lastOutput={pausedLastLine}
            onStartWork={startWork}
            onResume={resumeSession}
            onResumeAll={resumeAllOnMap}
            mapCounts={mapCounts}
            onOpenTicket={(ticket) => setTabs(openTab(tabs, { kind: "ticket", ...ticket }))}
            onTicketAction={(action) => requestAction(action, "ticket")}
            header={{
              open: !collapsedHeaders.has(tabKey(activeDocument)),
              onToggle: () =>
                setCollapsedHeaders((current) => {
                  const next = new Set(current);
                  if (!next.delete(tabKey(activeDocument))) next.add(tabKey(activeDocument));
                  return next;
                }),
            }}
          />
        ) : (
          (activeTab === undefined || activeDocument !== undefined) && (
            <p className="empty">Select a ticket or map to open it here.</p>
          )
        )}
      </main>
      <PanelResizer
        side="left"
        width={panelWidths.left}
        onResize={(width) => resizePanel("left", width)}
        onCommit={(width) => savePanelWidth("left", width)}
      />
      <PanelResizer
        side="right"
        width={panelWidths.right}
        onResize={(width) => resizePanel("right", width)}
        onCommit={(width) => savePanelWidth("right", width)}
      />
      <aside className="right-side">
        {project === null ? (
          <p className="empty">Open a git repo to browse its files.</p>
        ) : (
          <>
            <Explorer
              hint={worktreeHint}
              projectView={project}
              revision={explorerRevision}
              watchedDirs={(root) =>
                tabs.open.flatMap((tab) =>
                  (tab.kind === "file" || tab.kind === "diff") && tab.root === root ? [dirName(tab.path)] : [],
                )
              }
              onOpenFile={(root, path) => setTabs(openTab(tabs, { kind: "file", root, path }))}
              onOpenDiff={(root, path) => setTabs(openTab(tabs, { kind: "diff", root, path }))}
            />
            <SourceControl
              hint={worktreeHint}
              projectView={project}
              localTracker={project.tracker?.kind === "local-markdown"}
              revision={explorerRevision}
              onOpenDiff={(root, path) => setTabs(openTab(tabs, { kind: "diff", root, path }))}
              onShowWorktree={(path) => setPinned({ tab: tabs.active, path })}
              onStartPr={(key, agentId) => {
                const ticket = parseTicketKey(key);
                return ticket === null ? Promise.resolve() : startWork({ kind: "ticket", ticket }, agentId, "pr");
              }}
            />
          </>
        )}
      </aside>
      {dialog === "new-ticket" && project?.tree.ok && (
        <NewTicketDialog
          tree={project.tree.tree}
          initialMap={
            activeTab === undefined ||
            activeTab.kind === "terminal" ||
            activeTab.kind === "file" ||
            activeTab.kind === "diff"
              ? null
              : activeTab.kind === "map"
                ? activeTab.name
                : activeTab.map
          }
          autoCommit={settings.autoCommit}
          onCancel={() => setDialog(null)}
          onCreate={(ticket) => {
            setDialog(null);
            void requestAction({ kind: "create", ticket }, "general-button");
          }}
        />
      )}
      {dialog === "new-map" && project !== null && (
        <NewMapDialog
          onCancel={() => setDialog(null)}
          onStart={async (agentId, skill) => {
            setDialog(null);
            await startWork({ kind: "new-map" }, agentId, skill);
          }}
        />
      )}
      {project?.tree.ok && project.tree.compatibility.needsDialog && skippedSetup !== setupKey && (
        <CompatDialog
          report={project.tree.skillSetup}
          onRunCheck={async (agentId, skill) => {
            setSkippedSetup(setupKey);
            await startWork({ kind: "compat-check" }, agentId, skill);
          }}
          onSkip={() => setSkippedSetup(setupKey)}
          onAccept={() => void window.dryland.acceptDeviations()}
        />
      )}
      {dialog === "new-scratch" && project !== null && (
        <NewScratchDialog
          onCancel={() => setDialog(null)}
          onStart={async (agentId, skill) => {
            setDialog(null);
            await startWork({ kind: "scratch" }, agentId, skill);
          }}
        />
      )}
      {dialog === "settings" && (
        <SettingsDialog
          settings={settings}
          projectName={project?.name ?? null}
          liveEventsPanel={liveEventsPanel}
          legendDismissed={legendDismissed}
          skillSetup={
            project?.tree.ok ? { report: project.tree.skillSetup, compatibility: project.tree.compatibility } : null
          }
          hooksRevision={hooksRevision}
          onHooks={(agentId, action) => void changeHooks(agentId, action)}
          onRunCheck={async (agentId, skill) => {
            setSkippedSetup(setupKey);
            setDialog(null);
            await startWork({ kind: "compat-check" }, agentId, skill);
          }}
          onRevokeDeviations={() => {
            // The dialog asks again at once, even if it was skipped earlier in this session.
            setSkippedSetup(null);
            void window.dryland.revokeDeviations();
          }}
          onChange={(change) => {
            if (change.kind === "reset-legend") setState({ ...state, legendDismissed: false });
            void window.dryland.changeSetting(change);
          }}
          onLiveEventsPanel={setLiveEventsPanel}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "all-projects" && (
        <AllProjectsDialog
          current={project?.path ?? null}
          sessions={everySession.filter((session) => sessionState(session) !== "ended")}
          revision={`${state.openProjects.map((p) => p.path).join("|")}#${everySession.map((s) => sessionState(s)).join(",")}`}
          onOpen={(path) => {
            setDialog(null);
            void switchProject(path);
          }}
          onClose={() => setDialog(null)}
          onCloseProject={(path) => void closeProject(path)}
        />
      )}
      {dialog === "about" && <AboutDialog onClose={() => setDialog(null)} />}
      {quitRequest !== null && <QuitDialog request={quitRequest} onClose={() => setQuitRequest(null)} />}
      {pending !== null && (
        <ConfirmWrite pending={pending} onConfirm={confirmPending} onCancel={() => setPending(null)} />
      )}
      {pendingStart !== null && (
        <ConfirmWrite
          pending={pendingStart}
          onConfirm={(dontAskAgain) => {
            const { start, type } = pendingStart;
            setPendingStart(null);
            if (dontAskAgain) {
              setState({ ...state, settings: { ...settings, dontAsk: { ...settings.dontAsk, [type]: true } } });
              void window.dryland.dontAskAgain(type);
            }
            void start();
          }}
          onCancel={() => setPendingStart(null)}
        />
      )}
      {stopping !== null && (
        <ConfirmStop
          session={stopping}
          state={sessionState(stopping)}
          unseen={isUnseen(stopping)}
          onConfirm={() => stopSession(stopping)}
          onCancel={() => setStopping(null)}
        />
      )}
      <LiveEventsPanel events={liveEvents} mode={liveEventsPanel} onMode={setLiveEventsPanel} />
      <footer className="statusbar">
        {PANEL_SIDES.map((side) => (
          <button key={side} onClick={() => togglePanel(side)}>
            {panelFolded[side] ? `Show ${side} panel` : `Hide ${side} panel`}
          </button>
        ))}
        <button
          aria-expanded={liveEventsPanel !== "hidden"}
          onClick={() => setLiveEventsPanel(liveEventsPanel === "hidden" ? lastVisiblePanel.current : "hidden")}
        >
          {liveEventsPanel === "hidden" ? "Show live events" : "Hide live events"}
        </button>
        <span>{project === null ? "No project" : project.path}</span>
        {selected !== undefined && (
          <span aria-label="Selected session" title={selected.worktree.path}>
            {selected.agent.name}: {stateLabel(sessionState(selected), selected.statusApproximate)} ·{" "}
            {selected.worktree.branch}
          </span>
        )}
        <span aria-label="Session counts">
          {sessionCounts(hiddenSessions, openSessions, sessionStates, pausedList.length)}
        </span>
      </footer>
    </div>
  );
}
