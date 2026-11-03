/** What the application menu holds, shared by the native menu (accelerators, macOS) and the title bar's hamburger. */

export type AppMenuId =
  | "new-map"
  | "new-scratch"
  | "new-ticket"
  | "new-terminal"
  | "open-project"
  | "settings"
  | "quit"
  | "resume-all"
  | "reload"
  | "devtools"
  | "about";

export interface MenuItem {
  id: AppMenuId;
  label: string;
  /** An Electron accelerator; `CmdOrCtrl` is Cmd on macOS and Ctrl elsewhere. */
  accelerator?: string;
  enabled: boolean;
}

export type MenuEntry = MenuItem | "separator";

export interface AppMenu {
  label: string;
  entries: MenuEntry[];
}

/** The menus, with the commands that need a project enabled only when `hasProject`. */
export function appMenu(hasProject: boolean): AppMenu[] {
  const item = (id: AppMenuId, label: string, needsProject: boolean, accelerator?: string): MenuItem => ({
    id,
    label,
    ...(accelerator === undefined ? {} : { accelerator }),
    enabled: !needsProject || hasProject,
  });
  return [
    {
      label: "File",
      entries: [
        item("new-map", "New Map...", true, "CmdOrCtrl+Shift+M"),
        item("new-scratch", "New Scratch Session...", true),
        item("new-ticket", "New Ticket...", true, "CmdOrCtrl+N"),
        item("new-terminal", "New Terminal", true, "Ctrl+`"),
        item("open-project", "Open Project...", false, "CmdOrCtrl+O"),
        "separator",
        item("settings", "Settings...", false, "CmdOrCtrl+,"),
        "separator",
        item("quit", "Quit", false),
      ],
    },
    { label: "Sessions", entries: [item("resume-all", "Resume All Paused Sessions", true)] },
    {
      label: "View",
      entries: [
        item("reload", "Reload", false, "CmdOrCtrl+R"),
        item("devtools", "Toggle Developer Tools", false, "CmdOrCtrl+Shift+I"),
      ],
    },
    { label: "Help", entries: [item("about", "About Dryland ADE", false)] },
  ];
}

/** An accelerator as the menu shows it on `platform`. */
export function acceleratorLabel(accelerator: string, platform: string): string {
  return accelerator.replace("CmdOrCtrl", platform === "darwin" ? "Cmd" : "Ctrl");
}
