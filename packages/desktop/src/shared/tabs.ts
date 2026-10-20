/** A document an editor tab can show: a ticket (by map and number) or a map. */
export type DocumentRef = { kind: "ticket"; map: string; id: string } | { kind: "map"; name: string };

/** A terminal, by the id the main process gave it. Terminals never outlive the app; see `SessionRef` for sessions. */
export interface TerminalRef {
  kind: "terminal";
  id: string;
}

/**
 * A ticket's session, by the ticket. How a session tab is saved and restored: a terminal's id does not outlive the
 * app, the ticket does. Shown, it becomes the session's terminal (resuming the session when it is paused).
 */
export interface SessionRef {
  kind: "session";
  map: string;
  id: string;
}

/** A file of a worktree, read-only. `root` is the worktree's path and `path` the file's, relative to it, with `/`. */
export interface FileRef {
  kind: "file";
  root: string;
  path: string;
}

/** A changed file of a worktree, as a diff against the worktree's base. */
export interface DiffRef {
  kind: "diff";
  root: string;
  path: string;
}

/** What an editor tab shows. */
export type ItemRef = DocumentRef | TerminalRef | SessionRef | FileRef | DiffRef;

export interface TabsState {
  open: ItemRef[];
  /** The `tabKey` of the focused tab, `null` when none is open. */
  active: string | null;
}

export const EMPTY_TABS: TabsState = { open: [], active: null };

export function tabKey(ref: ItemRef): string {
  if (ref.kind === "terminal") return `terminal:${ref.id}`;
  if (ref.kind === "session") return `session:${ticketKey(ref)}`;
  if (ref.kind === "file" || ref.kind === "diff") return `${ref.kind}:${ref.root}|${ref.path}`;
  return ref.kind === "ticket" ? `ticket:${ticketKey(ref)}` : `map:${ref.name}`;
}

/** A ticket's `map/id`, as the CLI and the tracker write it. */
export const ticketKey = (ref: { map: string; id: string }): string => `${ref.map}/${ref.id}`;

/** The ticket a `map/id` key names; `null` when it is not one. The inverse of `ticketKey`. */
export function parseTicketKey(key: string): { map: string; id: string } | null {
  const [map, id, ...rest] = key.split("/");
  return map === undefined || map === "" || id === undefined || id === "" || rest.length > 0 ? null : { map, id };
}

/** Opens `ref` in a new tab, or focuses its tab when it is already open. */
export function openTab(state: TabsState, ref: ItemRef): TabsState {
  const key = tabKey(ref);
  const open = state.open.some((tab) => tabKey(tab) === key) ? state.open : [...state.open, ref];
  return { open, active: key };
}

/** The open tab that has focus, if any. */
export function activeItem(state: TabsState): ItemRef | undefined {
  return state.open.find((tab) => tabKey(tab) === state.active);
}

export function focusTab(state: TabsState, key: string): TabsState {
  return state.open.some((tab) => tabKey(tab) === key) ? { ...state, active: key } : state;
}

/** Closes a tab; when it was focused, focus moves to its right neighbour, else its left one. */
export function closeTab(state: TabsState, key: string): TabsState {
  const index = state.open.findIndex((tab) => tabKey(tab) === key);
  if (index === -1) return state;
  const open = state.open.filter((_, i) => i !== index);
  if (state.active !== key) return { ...state, open };
  const next = open[index] ?? open[index - 1];
  return { open, active: next === undefined ? null : tabKey(next) };
}

/** Replaces the tab `key` with `ref` in place; focus follows when it was on that tab. */
export function replaceTab(state: TabsState, key: string, ref: ItemRef): TabsState {
  const index = state.open.findIndex((tab) => tabKey(tab) === key);
  if (index === -1) return state;
  const newKey = tabKey(ref);
  // A tab of that item already open stays where it is; the replaced one just goes.
  const exists = state.open.some((tab, i) => i !== index && tabKey(tab) === newKey);
  const open = exists
    ? state.open.filter((_, i) => i !== index)
    : state.open.map((tab, i) => (i === index ? ref : tab));
  return { open, active: state.active === key ? newKey : state.active };
}

/**
 * The tabs to save: a terminal tab is saved as the session of its ticket (`ticketOf` names it), and dropped when
 * it has none, since a terminal's id does not outlive the app. File and diff tabs are dropped too.
 */
export function savedTabs(
  state: TabsState,
  ticketOf: (terminalId: string) => { map: string; id: string } | null,
): TabsState {
  const keyOf = new Map<string, string>();
  const open: ItemRef[] = [];
  for (const tab of state.open) {
    let ref: ItemRef | null = tab;
    if (tab.kind === "terminal") {
      const ticket = ticketOf(tab.id);
      ref = ticket === null ? null : { kind: "session", map: ticket.map, id: ticket.id };
    }
    // A worktree a file was open in may be gone by the next start.
    if (tab.kind === "file" || tab.kind === "diff") ref = null;
    if (ref === null) continue;
    keyOf.set(tabKey(tab), tabKey(ref));
    if (!open.some((saved) => tabKey(saved) === tabKey(ref))) open.push(ref);
  }
  const active = state.active === null ? undefined : keyOf.get(state.active);
  const last = open.at(-1);
  return { open, active: active ?? (last === undefined ? null : tabKey(last)) };
}

function parseRef(raw: unknown): DocumentRef | SessionRef | null {
  if (raw === null || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if ((r.kind === "ticket" || r.kind === "session") && typeof r.map === "string" && typeof r.id === "string") {
    return { kind: r.kind, map: r.map, id: r.id };
  }
  if (r.kind === "map" && typeof r.name === "string") return { kind: "map", name: r.name };
  return null;
}

/** Reads saved tabs defensively: anything unreadable, and every terminal tab (see `savedTabs`), is dropped, never thrown. */
export function parseTabs(raw: unknown): TabsState {
  if (raw === null || typeof raw !== "object") return EMPTY_TABS;
  const { open: rawOpen, active } = raw as Record<string, unknown>;
  if (!Array.isArray(rawOpen)) return EMPTY_TABS;
  const seen = new Set<string>();
  const open: (DocumentRef | SessionRef)[] = [];
  for (const entry of rawOpen) {
    const ref = parseRef(entry);
    if (ref === null || seen.has(tabKey(ref))) continue;
    seen.add(tabKey(ref));
    open.push(ref);
  }
  const last = open.at(-1);
  const activeKey = typeof active === "string" && seen.has(active) ? active : last === undefined ? null : tabKey(last);
  return { open, active: activeKey };
}
