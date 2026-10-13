import type { PtyProcess, PtyProvider, PtySpawnOptions } from "../src/main/pty/provider.ts";

/** A PTY process that records what the app does to it and lets a test play the process's side. */
export class FakePty implements PtyProcess {
  readonly written: string[] = [];
  readonly resizes: { cols: number; rows: number }[] = [];
  killed = false;
  private readonly dataListeners = new Set<(data: string) => void>();
  private readonly exitListeners = new Set<(exitCode: number) => void>();

  constructor(
    readonly pid: number,
    readonly options: PtySpawnOptions,
  ) {}

  onData(listener: (data: string) => void): () => void {
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }

  onExit(listener: (exitCode: number) => void): () => void {
    this.exitListeners.add(listener);
    return () => this.exitListeners.delete(listener);
  }

  write(data: string): void {
    this.written.push(data);
  }

  resize(cols: number, rows: number): void {
    this.resizes.push({ cols, rows });
  }

  kill(): void {
    this.killed = true;
    this.exit(0);
  }

  /** Test side: the process prints. */
  emit(data: string): void {
    for (const listener of this.dataListeners) listener(data);
  }

  /** Test side: the process ends. */
  exit(exitCode: number): void {
    const listeners = [...this.exitListeners];
    this.exitListeners.clear();
    for (const listener of listeners) listener(exitCode);
  }
}

export class FakePtyProvider implements PtyProvider {
  readonly spawned: FakePty[] = [];

  spawn(options: PtySpawnOptions): FakePty {
    const pty = new FakePty(1000 + this.spawned.length, options);
    this.spawned.push(pty);
    return pty;
  }
}
