import { describe, expect, it } from "vitest";
import {
  closeTab,
  EMPTY_TABS,
  focusTab,
  openTab,
  parseTabs,
  replaceTab,
  savedTabs,
  tabKey,
  type ItemRef,
} from "../src/shared/tabs.ts";

const ticket = (id: string): ItemRef => ({ kind: "ticket", map: "shop", id });
const shopMap: ItemRef = { kind: "map", name: "shop" };

describe("openTab", () => {
  it("opens an item in a new tab and focuses it", () => {
    const state = openTab(openTab(EMPTY_TABS, ticket("01")), shopMap);

    expect(state.open).toEqual([ticket("01"), shopMap]);
    expect(state.active).toBe(tabKey(shopMap));
  });

  it("focuses the existing tab when the item is already open", () => {
    const state = openTab(openTab(openTab(EMPTY_TABS, ticket("01")), shopMap), ticket("01"));

    expect(state.open).toHaveLength(2);
    expect(state.active).toBe(tabKey(ticket("01")));
  });

  it("tells a ticket from a map of the same name", () => {
    expect(tabKey(ticket("01"))).not.toBe(tabKey({ kind: "map", name: "01" }));
  });
});

describe("terminal tabs", () => {
  const terminal: ItemRef = { kind: "terminal", id: "abc" };

  it("open, focus and close like any other tab", () => {
    const opened = openTab(openTab(EMPTY_TABS, ticket("01")), terminal);
    expect(opened.active).toBe(tabKey(terminal));
    expect(closeTab(opened, tabKey(terminal)).active).toBe(tabKey(ticket("01")));
  });

  it("are not read back: parseTabs drops them", () => {
    const saved = openTab(openTab(EMPTY_TABS, ticket("01")), terminal);
    expect(parseTabs(saved)).toEqual({ open: [ticket("01")], active: tabKey(ticket("01")) });
  });
});

describe("closeTab", () => {
  const three = [ticket("01"), ticket("02"), ticket("03")].reduce(openTab, EMPTY_TABS);

  it("activates the tab to the right when the active tab closes", () => {
    const state = closeTab(focusTab(three, tabKey(ticket("02"))), tabKey(ticket("02")));

    expect(state.open).toEqual([ticket("01"), ticket("03")]);
    expect(state.active).toBe(tabKey(ticket("03")));
  });

  it("activates the tab to the left when the last tab closes", () => {
    expect(closeTab(three, tabKey(ticket("03"))).active).toBe(tabKey(ticket("02")));
  });

  it("keeps the active tab when another one closes", () => {
    expect(closeTab(three, tabKey(ticket("01"))).active).toBe(tabKey(ticket("03")));
  });

  it("has no active tab once the last one closes", () => {
    expect(closeTab(openTab(EMPTY_TABS, shopMap), tabKey(shopMap))).toEqual(EMPTY_TABS);
  });
});

describe("parseTabs", () => {
  it("restores saved tabs", () => {
    const saved = { open: [ticket("01"), shopMap], active: tabKey(shopMap) };

    expect(parseTabs(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });

  it("drops malformed and duplicate entries and an active tab that is not open", () => {
    const state = parseTabs({
      open: [ticket("01"), { kind: "ticket", map: 3 }, "x", null, ticket("01"), { kind: "map", name: "shop" }],
      active: "ticket:gone/09",
    });

    expect(state.open).toEqual([ticket("01"), shopMap]);
    expect(state.active).toBe(tabKey(shopMap));
  });

  it("falls back to no tabs for anything that is not an object", () => {
    expect(parseTabs(undefined)).toEqual(EMPTY_TABS);
    expect(parseTabs("tabs")).toEqual(EMPTY_TABS);
    expect(parseTabs({ open: "all" })).toEqual(EMPTY_TABS);
  });
});

describe("session tabs", () => {
  const session: ItemRef = { kind: "session", map: "shop", id: "01" };
  const terminal: ItemRef = { kind: "terminal", id: "t1" };
  const ticketOf = (id: string) => (id === "t1" ? { map: "shop", id: "01" } : null);

  it("are keyed apart from the ticket tab and the terminal", () => {
    expect(tabKey(session)).not.toBe(tabKey(ticket("01")));
    expect(tabKey(session)).not.toBe(tabKey(terminal));
  });

  it("are saved in place of the terminal a session runs in, and read back", () => {
    const open = [ticket("02"), terminal].reduce(openTab, EMPTY_TABS);
    const saved = savedTabs(open, ticketOf);
    expect(saved).toEqual({ open: [ticket("02"), session], active: tabKey(session) });
    expect(parseTabs(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });

  it("drop plain terminals and move focus to the last tab saved", () => {
    const open = [ticket("02"), { kind: "terminal", id: "plain" } as ItemRef].reduce(openTab, EMPTY_TABS);
    expect(savedTabs(open, ticketOf)).toEqual({ open: [ticket("02")], active: tabKey(ticket("02")) });
  });

  it("are saved once, however many terminals ran the ticket", () => {
    const open = [terminal, session].reduce(openTab, EMPTY_TABS);
    expect(savedTabs(open, ticketOf).open).toEqual([session]);
  });

  it("are replaced in place by the terminal they resume into, keeping focus", () => {
    const open = [ticket("02"), session, ticket("03")].reduce(openTab, EMPTY_TABS);
    const shown = replaceTab(focusTab(open, tabKey(session)), tabKey(session), terminal);
    expect(shown.open).toEqual([ticket("02"), terminal, ticket("03")]);
    expect(shown.active).toBe(tabKey(terminal));
  });

  it("keep focus where it was when another tab is replaced", () => {
    const open = [session, ticket("03")].reduce(openTab, EMPTY_TABS);
    expect(replaceTab(open, tabKey(session), terminal).active).toBe(tabKey(ticket("03")));
  });

  it("merge into an open tab of the same item when replaced by it", () => {
    const open = [ticket("01"), session].reduce(openTab, EMPTY_TABS);
    expect(replaceTab(open, tabKey(session), ticket("01"))).toEqual({
      open: [ticket("01")],
      active: tabKey(ticket("01")),
    });
  });
});
