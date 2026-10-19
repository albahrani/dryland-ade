import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
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
    allowProposedApi: true, // The Unicode addon needs it.
    theme: { background: "#1e1e1e", foreground: "#cccccc" },
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  // Unicode 11 widths, so emoji and CJK text take the cells the programs running in the shell expect.
  term.loadAddon(new Unicode11Addon());
  term.unicode.activeVersion = "11";
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

/** The terminal `id` if a view of it exists, without creating one. */
export const existingTerminal = (id: string): TerminalEntry | undefined => entries.get(id);

/** The newest non-empty line terminal `id` shows, `null` without a view or in its first screens of blank lines. */
export function lastLine(id: string): string | null {
  // The line Dryland writes when a session is stopped is not the session's output.
  const buffer = entries.get(id)?.term.buffer.active;
  if (buffer === undefined) return null;
  // Below the newest output sit only the screen's blank rows, so a screenful or two of lines is enough to look at.
  for (let y = buffer.length - 1; y >= Math.max(0, buffer.length - 200); y--) {
    const text = buffer.getLine(y)?.translateToString(true).trim();
    if (text && text !== "[session stopped]") return text;
  }
  return null;
}

export function disposeTerminal(id: string): void {
  entries.get(id)?.term.dispose();
  entries.delete(id);
}

/**
 * Notes `message` in terminal `id` and turns what it shows into a transcript: the output stays to be read, and no
 * more input is taken. A terminal with no view has nothing to turn.
 */
export function endTerminal(id: string, message: string): void {
  const term = entries.get(id)?.term;
  if (term === undefined) return;
  term.write(`\r\n\x1b[2m${message}\x1b[0m\r\n`);
  term.options.disableStdin = true;
  term.options.cursorBlink = false;
}

/** Routes terminal output and exits from the main process to the registered terminals. */
export function routeTerminalEvents(): () => void {
  const stopData = window.dryland.onTerminalData((id, data) => entries.get(id)?.term.write(data));
  const stopExit = window.dryland.onTerminalExit((id, exitCode) =>
    endTerminal(id, `[process exited with code ${exitCode}]`),
  );
  return () => {
    stopData();
    stopExit();
  };
}
