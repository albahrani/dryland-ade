import { chmodSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface LauncherTarget {
  /** The executable that runs the CLI: the Electron binary, which acts as Node with `ELECTRON_RUN_AS_NODE`. */
  runtime: string;
  /** The bundled `dryland` CLI script. */
  cli: string;
}

const shQuote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`;
// In a batch file `%` starts a variable, so a literal one is doubled.
const cmdQuote = (value: string) => `"${value.replaceAll("%", "%%")}"`;

/** Writes `path` whole or not at all, so a session never runs a half-written launcher. */
function writeAtomically(path: string, content: string, mode: number): void {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, content, { mode });
  chmodSync(temporary, mode);
  renameSync(temporary, path);
}

/**
 * Writes the `dryland` launcher into `dir`: a POSIX shell script and a Windows batch file that run the CLI with
 * the app's own runtime, so sessions need no system Node. Replaces whatever an earlier version left there.
 */
export function writeLauncher(dir: string, { runtime, cli }: LauncherTarget): void {
  mkdirSync(dir, { recursive: true });
  writeAtomically(
    join(dir, "dryland"),
    ["#!/bin/sh", `ELECTRON_RUN_AS_NODE=1 exec ${shQuote(runtime)} ${shQuote(cli)} "$@"`, ""].join("\n"),
    0o755,
  );
  writeAtomically(
    join(dir, "dryland.cmd"),
    [
      "@echo off",
      "setlocal",
      "set ELECTRON_RUN_AS_NODE=1",
      `${cmdQuote(runtime)} ${cmdQuote(cli)} %*`,
      "exit /b %ERRORLEVEL%",
      "",
    ].join("\r\n"),
    0o644,
  );
}
