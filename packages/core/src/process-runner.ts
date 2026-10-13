import { execFile } from "node:child_process";

export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ProcessRunner {
  run(command: string, args: string[], options?: { cwd?: string }): Promise<ProcessResult>;
}

/** The only way core reaches `git`, `gh` and `glab`. Never rejects on a non-zero exit. */
export const nodeProcessRunner: ProcessRunner = {
  run(command, args, options = {}) {
    return new Promise((resolve) => {
      execFile(command, args, { cwd: options.cwd, encoding: "utf8", windowsHide: true }, (error, stdout, stderr) => {
        const code = error && typeof error.code === "number" ? error.code : error ? 1 : 0;
        resolve({ stdout, stderr: error && !stderr ? error.message : stderr, exitCode: code });
      });
    });
  },
};
