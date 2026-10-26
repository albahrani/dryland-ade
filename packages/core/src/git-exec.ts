import { spawn } from "node:child_process";
import { DrylandError } from "./errors.ts";

export interface GitResult {
  stdout: string;
  exitCode: number;
}

/** Runs `git` with optional stdin and env; never rejects on a non-zero exit. Output is bytes so blobs survive. */
export function runGit(cwd: string, args: string[], opts: { input?: string; env?: Record<string, string> } = {}) {
  return new Promise<GitResult & { raw: Buffer; stderr: string }>((resolve, reject) => {
    const child = spawn("git", args, { cwd, env: { ...process.env, ...opts.env }, windowsHide: true });
    const out: Buffer[] = [];
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    child.on("error", reject);
    child.on("close", (code) => {
      const raw = Buffer.concat(out);
      resolve({ stdout: raw.toString("utf8"), raw, stderr, exitCode: code ?? 1 });
    });
    // git may exit without reading its stdin; that is not an error.
    child.stdin.on("error", () => undefined);
    child.stdin.end(opts.input ?? "");
  });
}

export async function gitOk(cwd: string, args: string[], opts?: { input?: string; env?: Record<string, string> }) {
  const result = await runGit(cwd, args, opts);
  if (result.exitCode !== 0) {
    throw new DrylandError(
      `git ${args[0] ?? ""} failed: ${result.stderr.trim() || "no output"}`,
      "Run dryland from inside a git repository.",
    );
  }
  return result.stdout.trim();
}
