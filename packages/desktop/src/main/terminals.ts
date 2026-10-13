import { randomUUID } from "node:crypto";
import type { PtyProcess, PtyProvider } from "./pty/provider.ts";
import type { ShellSpec } from "./shell.ts";

export interface TerminalManagerOptions {
  provider: PtyProvider;
  shell: ShellSpec;
  /** The environment shells inherit. */
  env: Record<string, string | undefined>;
  onData(id: string, data: string): void;
  /** Called when a terminal's process ends on its own; not for terminals closed through the manager. */
  onExit(id: string, exitCode: number): void;
}

export interface OpenOptions {
  cwd: string;
  cols?: number;
  rows?: number;
}

export interface TerminalManager {
  /** Starts a shell in `cwd` and returns the new terminal's id. */
  open(options: OpenOptions): string;
  write(id: string, data: string): void;
  resize(id: string, cols: number, rows: number): void;
  close(id: string): void;
  /** Kills every live terminal; used on quit so no process outlives the app. */
  closeAll(): void;
  liveIds(): string[];
}

/** Sizes come from the renderer; anything else would make the PTY throw. */
const validSize = (n: number) => Number.isInteger(n) && n >= 1 && n <= 1000;

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;

export function createTerminalManager(options: TerminalManagerOptions): TerminalManager {
  const live = new Map<string, PtyProcess>();

  function terminalEnv(): Record<string, string> {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(options.env)) if (value !== undefined) env[key] = value;
    return { ...env, TERM: "xterm-256color", COLORTERM: "truecolor" };
  }

  return {
    open({ cwd, cols = DEFAULT_COLS, rows = DEFAULT_ROWS }) {
      const id = randomUUID();
      const pty = options.provider.spawn({
        file: options.shell.file,
        args: options.shell.args,
        cwd,
        cols,
        rows,
        env: terminalEnv(),
      });
      live.set(id, pty);
      pty.onData((data) => options.onData(id, data));
      pty.onExit((exitCode) => {
        if (live.get(id) !== pty) return;
        live.delete(id);
        options.onExit(id, exitCode);
      });
      return id;
    },
    write(id, data) {
      if (typeof data === "string") live.get(id)?.write(data);
    },
    resize(id, cols, rows) {
      if (validSize(cols) && validSize(rows)) live.get(id)?.resize(cols, rows);
    },
    close(id) {
      const pty = live.get(id);
      if (pty === undefined) return;
      live.delete(id);
      pty.kill();
    },
    closeAll() {
      const all = [...live.values()];
      live.clear();
      for (const pty of all) pty.kill();
    },
    liveIds: () => [...live.keys()],
  };
}
