/** What an editor tab shows: a ticket (by map and number) or a map. */
export type ItemRef = { kind: "ticket"; map: string; id: string } | { kind: "map"; name: string };

export interface TabsState {
  open: ItemRef[];
  /** The `tabKey` of the focused tab, `null` when none is open. */
  active: string | null;
}

export const EMPTY_TABS: TabsState = { open: [], active: null };

export function tabKey(ref: ItemRef): string {
  return ref.kind === "ticket" ? `ticket:${ref.map}/${ref.id}` : `map:${ref.name}`;
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

function parseRef(raw: unknown): ItemRef | null {
  if (raw === null || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.kind === "ticket" && typeof r.map === "string" && typeof r.id === "string") {
    return { kind: "ticket", map: r.map, id: r.id };
  }
  if (r.kind === "map" && typeof r.name === "string") return { kind: "map", name: r.name };
  return null;
}

/** Reads saved tabs defensively: anything unreadable is dropped, never thrown. */
export function parseTabs(raw: unknown): TabsState {
  if (raw === null || typeof raw !== "object") return EMPTY_TABS;
  const { open: rawOpen, active } = raw as Record<string, unknown>;
  if (!Array.isArray(rawOpen)) return EMPTY_TABS;
  const seen = new Set<string>();
  const open: ItemRef[] = [];
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
