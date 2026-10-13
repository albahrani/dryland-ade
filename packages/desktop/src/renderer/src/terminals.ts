import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

interface TerminalEntry {
  term: Terminal;
  fit: FitAddon;
}

const entries = new Map<string, TerminalEntry>();
const isWindows = navigator.platform.startsWith("Win");

/**
 * The terminal `id`, created on first use. Terminals live here rather than in a component so that
 * output keeps arriving, and scrollback survives, while its tab is not shown.
 */
export function getOrCreateTerminal(id: string): TerminalEntry {
  const existing = entries.get(id);
  if (existing !== undefined) return existing;

  const term = new Terminal({
    cursorBlink: true,
    fontFamily: 'Consolas, "Cascadia Mono", Menlo, monospace',
    fontSize: 13,
    scrollback: 5000,
    theme: { background: "#1e1e1e", foreground: "#cccccc" },
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.onData((data) => window.dryland.writeTerminal(id, data));
  term.onResize(({ cols, rows }) => window.dryland.resizeTerminal(id, cols, rows));
  term.attachCustomKeyEventHandler((event) => {
    if (event.type !== "keydown" || !(event.ctrlKey || event.metaKey)) return true;
    // Copy: Ctrl+Shift+C everywhere, plus plain Ctrl+C on Windows when text is selected (otherwise it is SIGINT).
    if (event.code === "KeyC" && (event.shiftKey || (isWindows && term.hasSelection()))) {
      void navigator.clipboard.writeText(term.getSelection());
      return false;
    }
    // Paste: leave it to the browser's paste event, which xterm turns into input.
    if (event.code === "KeyV" && (event.shiftKey || isWindows)) return false;
    return true;
  });

  const entry = { term, fit };
  entries.set(id, entry);
  return entry;
}

export function disposeTerminal(id: string): void {
  entries.get(id)?.term.dispose();
  entries.delete(id);
}

/** Routes terminal output and exits from the main process to the registered terminals. */
export function routeTerminalEvents(): () => void {
  const stopData = window.dryland.onTerminalData((id, data) => entries.get(id)?.term.write(data));
  const stopExit = window.dryland.onTerminalExit((id, exitCode) =>
    entries.get(id)?.term.write(`\r\n\x1b[2m[process exited with code ${exitCode}]\x1b[0m\r\n`),
  );
  return () => {
    stopData();
    stopExit();
  };
}
