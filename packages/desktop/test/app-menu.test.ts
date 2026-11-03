import { describe, expect, it } from "vitest";
import { appMenu, type MenuEntry, type MenuItem, acceleratorLabel } from "../src/shared/app-menu.ts";

const items = (label: string, hasProject: boolean): MenuItem[] =>
  (appMenu(hasProject).find((menu) => menu.label === label)?.entries ?? []).filter(
    (entry): entry is MenuItem => entry !== "separator",
  );
const find = (hasProject: boolean, id: string): MenuItem | undefined =>
  appMenu(hasProject)
    .flatMap((menu) => menu.entries)
    .find((entry: MenuEntry): entry is MenuItem => entry !== "separator" && entry.id === id);

describe("the application menu", () => {
  it("has File, Sessions, View and Help, in that order", () => {
    expect(appMenu(true).map((menu) => menu.label)).toEqual(["File", "Sessions", "View", "Help"]);
  });

  it("lists the File commands with their accelerators", () => {
    expect(items("File", true).map((item) => [item.label, item.accelerator])).toEqual([
      ["New Map...", "CmdOrCtrl+Shift+M"],
      ["New Scratch Session...", undefined],
      ["New Ticket...", "CmdOrCtrl+N"],
      ["New Terminal", "Ctrl+`"],
      ["Open Project...", "CmdOrCtrl+O"],
      ["Settings...", "CmdOrCtrl+,"],
      ["Quit", undefined],
    ]);
  });

  it("holds Resume All Paused Sessions, Reload, Toggle Developer Tools and About", () => {
    expect(items("Sessions", true).map((item) => item.label)).toEqual(["Resume All Paused Sessions"]);
    expect(items("View", true).map((item) => [item.label, item.accelerator])).toEqual([
      ["Reload", "CmdOrCtrl+R"],
      ["Toggle Developer Tools", "CmdOrCtrl+Shift+I"],
    ]);
    expect(items("Help", true).map((item) => item.label)).toEqual(["About Dryland ADE"]);
  });

  it("disables the commands that need a project until one is open", () => {
    const needing = ["new-map", "new-scratch", "new-ticket", "new-terminal", "resume-all"];
    for (const id of needing) {
      expect(find(false, id)?.enabled, id).toBe(false);
      expect(find(true, id)?.enabled, id).toBe(true);
    }
    for (const id of ["open-project", "settings", "quit", "reload", "devtools", "about"]) {
      expect(find(false, id)?.enabled, id).toBe(true);
    }
  });
});

describe("acceleratorLabel", () => {
  it("shows CmdOrCtrl as Ctrl on Windows and Linux and as the command key on macOS", () => {
    expect(acceleratorLabel("CmdOrCtrl+Shift+M", "win32")).toBe("Ctrl+Shift+M");
    expect(acceleratorLabel("CmdOrCtrl+,", "linux")).toBe("Ctrl+,");
    expect(acceleratorLabel("CmdOrCtrl+N", "darwin")).toBe("Cmd+N");
    expect(acceleratorLabel("Ctrl+`", "win32")).toBe("Ctrl+`");
  });
});
