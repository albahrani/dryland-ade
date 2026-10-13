/** One running pseudo-terminal process. */
export interface PtyProcess {
  readonly pid: number;
  /** Subscribes to output; returns an unsubscribe function. */
  onData(listener: (data: string) => void): () => void;
  /** Subscribes to the process ending, with its exit code. */
  onExit(listener: (exitCode: number) => void): () => void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  /** Ends the process. Safe to call after it has already exited. */
  kill(): void;
}

export interface PtySpawnOptions {
  file: string;
  args: string[];
  cwd: string;
  cols: number;
  rows: number;
  env: Record<string, string>;
}

/** The seam between the app and a real PTY implementation; `node-pty` in production, a fake in tests. */
export interface PtyProvider {
  spawn(options: PtySpawnOptions): PtyProcess;
}
