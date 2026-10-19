import { chmodSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface LauncherTarget {
  /** The executable that runs the CLI: the Electron binary, which acts as Node with `ELECTRON_RUN_AS_NODE`. */
  runtime: string;
  /** The bundled `dryland` CLI script. */
  cli: string;
}

/** An Agent CLI the launcher stands in for in a Dryland terminal: its adapter id and the command a user types. */
export interface AgentShim {
  id: string;
  binary: string;
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
 * the app's own runtime, so sessions need no system Node, and one shim per Agent CLI that runs it through
 * `dryland agent`, so a CLI started by hand gets the status hooks. Replaces whatever an earlier version left there.
 */
export function writeLauncher(dir: string, { runtime, cli }: LauncherTarget, shims: readonly AgentShim[] = []): void {
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
  for (const { id, binary } of shims) {
    writeAtomically(
      join(dir, binary),
      [
        "#!/bin/sh",
        'DRYLAND_LAUNCHER_DIR="$(dirname "$0")"',
        "export DRYLAND_LAUNCHER_DIR",
        `prepared="$(ELECTRON_RUN_AS_NODE=1 ${shQuote(runtime)} ${shQuote(cli)} agent-prepare ${id})" || exit $?`,
        "{ read -r real; read -r session; read -r flag; read -r file; } <<EOF",
        "$prepared",
        "EOF",
        "DRYLAND_SESSION_ID=$session",
        `DRYLAND_AGENT=${id}`,
        "export DRYLAND_SESSION_ID DRYLAND_AGENT",
        'if [ -n "$flag" ]; then exec "$real" "$@" "$flag" "$file"; fi',
        'exec "$real" "$@"',
        "",
      ].join("\n"),
      0o755,
    );
    writeAtomically(
      join(dir, `${binary}.cmd`),
      [
        "@echo off",
        "setlocal EnableDelayedExpansion",
        'set "DRYLAND_LAUNCHER_DIR=%~dp0"',
        "set ELECTRON_RUN_AS_NODE=1",
        "set N=0",
        `for /f "usebackq delims=" %%L in (\`""${runtime}" "${cli}" agent-prepare ${id}"\`) do (set /a N+=1 & set "L!N!=%%L")`,
        "set ELECTRON_RUN_AS_NODE=",
        "if !N! LSS 2 exit /b 1",
        // Delayed expansion off again, so a `!` in the user's arguments stays one.
        "setlocal DisableDelayedExpansion",
        'set "DRYLAND_SESSION_ID=%L2%"',
        `set "DRYLAND_AGENT=${id}"`,
        'if defined L4 (call "%L1%" %* %L3% "%L4%") else (call "%L1%" %*)',
        "exit /b %ERRORLEVEL%",
        "",
      ].join("\r\n"),
      0o644,
    );
  }
}
