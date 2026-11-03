/** The window's one top bar: a custom title bar on Windows and Linux; macOS keeps its native frame and menu bar. */

export const TITLE_BAR_HEIGHT = 36;

export const hasCustomTitleBar = (platform: string): boolean => platform !== "darwin";

/** The BrowserWindow options that hide the native frame and menu row and draw the window controls over the bar. */
export function titleBarWindowOptions(platform: string): {
  titleBarStyle?: "hidden";
  titleBarOverlay?: { color: string; symbolColor: string; height: number };
} {
  if (!hasCustomTitleBar(platform)) return {};
  return {
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#2b2d30", symbolColor: "#cccccc", height: TITLE_BAR_HEIGHT },
  };
}
