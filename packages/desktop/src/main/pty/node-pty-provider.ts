import { spawn } from "node-pty";
import type { PtyProcess, PtyProvider } from "./provider.ts";

/** The production PTY provider: `node-pty`, which uses ConPTY on Windows and `forkpty` elsewhere. */
export const nodePtyProvider: PtyProvider = {
  spawn({ file, args, cwd, cols, rows, env }): PtyProcess {
    const pty = spawn(file, args, { name: "xterm-256color", cols, rows, cwd, env });
    let exited = false;
    pty.onExit(() => (exited = true));
    return {
      pid: pty.pid,
      onData: (listener) => {
        const subscription = pty.onData(listener);
        return () => subscription.dispose();
      },
      onExit: (listener) => {
        const subscription = pty.onExit(({ exitCode }) => listener(exitCode));
        return () => subscription.dispose();
      },
      write: (data) => {
        if (!exited) pty.write(data);
      },
      resize: (newCols, newRows) => {
        // node-pty throws when resizing a process that has already gone.
        if (!exited) pty.resize(newCols, newRows);
      },
      kill: () => {
        if (exited) return;
        try {
          pty.kill();
        } catch {
          // Already gone; nothing left to kill.
        }
      },
    };
  },
};
