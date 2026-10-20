import { randomUUID } from "node:crypto";
import { createOutputBuffer, OUTPUT_LIMIT, type OutputBuffer } from "./output-buffer.ts";
import type { PtyProcess, PtyProvider } from "./pty/provider.ts";
import type { ShellSpec } from "./shell.ts";

export interface TerminalManagerOptions {
  provider: PtyProvider;
  shell: ShellSpec;
  /** How much of each terminal's newest output `output` keeps. */
  outputLimit?: number;
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
  /** The program to run instead of the shell, such as an Agent CLI. */
  program?: ShellSpec;
  /**
   * The whole environment, in place of the inherited one, so a caller can also remove variables; `id` is the new
   * terminal's id. Terminal capabilities are still set on top.
   */
  env?: (id: string) => Record<string, string>;
  /** Also receives the terminal's output. */
  onOutput?: (data: string) => void;
  /** Called once when the terminal ends, whether its process exited or it was closed through the manager. */
  onEnd?: () => void;
}

export interface TerminalManager {
  /** Starts the shell, or `program`, in `cwd` and returns the new terminal's id. */
  open(options: OpenOptions): string;
  write(id: string, data: string): void;
  resize(id: string, cols: number, rows: number): void;
  close(id: string): void;
  /** Kills every live terminal; used on quit so no process outlives the app. */
  closeAll(): void;
  liveIds(): string[];
  /**
   * The newest output of a live terminal, within the output limit, to replay into a view opened after it printed;
   * `null` once its process has ended.
   */
  output(id: string): string | null;
}

/** Sizes come from the renderer; anything else would make the PTY throw. */
const validSize = (n: number) => Number.isInteger(n) && n >= 1 && n <= 1000;

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;

export function createTerminalManager(options: TerminalManagerOptions): TerminalManager {
  const live = new Map<string, PtyProcess>();
  const outputs = new Map<string, OutputBuffer>();
  const endHandlers = new Map<string, () => void>();
  const forget = (id: string) => {
    live.delete(id);
    outputs.delete(id);
    const onEnd = endHandlers.get(id);
    endHandlers.delete(id);
    onEnd?.();
  };

  function inheritedEnv(): Record<string, string> {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(options.env)) if (value !== undefined) env[key] = value;
    return env;
  }

  return {
    open({ cwd, cols = DEFAULT_COLS, rows = DEFAULT_ROWS, program = options.shell, env, onOutput, onEnd }) {
      const id = randomUUID();
      const pty = options.provider.spawn({
        file: program.file,
        args: program.args,
        cwd,
        cols,
        rows,
        env: { ...(env?.(id) ?? inheritedEnv()), TERM: "xterm-256color", COLORTERM: "truecolor" },
      });
      const output = createOutputBuffer(options.outputLimit ?? OUTPUT_LIMIT);
      live.set(id, pty);
      outputs.set(id, output);
      if (onEnd !== undefined) endHandlers.set(id, onEnd);
      pty.onData((data) => {
        output.append(data);
        options.onData(id, data);
        onOutput?.(data);
      });
      pty.onExit((exitCode) => {
        if (live.get(id) !== pty) return;
        forget(id);
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
      forget(id);
      pty.kill();
    },
    closeAll() {
      const all = [...live.entries()];
      for (const [id] of all) forget(id);
      for (const [, pty] of all) pty.kill();
    },
    liveIds: () => [...live.keys()],
    output: (id) => outputs.get(id)?.text() ?? null,
  };
}
