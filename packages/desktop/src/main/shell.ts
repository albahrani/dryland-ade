import { existsSync } from "node:fs";
import { win32 } from "node:path";

export interface ShellSpec {
  file: string;
  args: string[];
}

function parseArgs(raw: string | undefined): string[] {
  if (raw === undefined) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((arg) => typeof arg === "string") ? parsed : [];
  } catch {
    return [];
  }
}

/** The first of `names` found in a `PATH` directory, as a full path. */
function findOnPath(names: string[], pathVariable: string, exists: (path: string) => boolean): string | undefined {
  for (const name of names) {
    for (const directory of pathVariable.split(win32.delimiter)) {
      const candidate = win32.join(directory, name);
      if (directory !== "" && exists(candidate)) return candidate;
    }
  }
  return undefined;
}

/**
 * The shell a new terminal runs: `DRYLAND_SHELL` (with JSON `DRYLAND_SHELL_ARGS`) if set, else the user's own.
 * On Windows that is PowerShell 7, else Windows PowerShell, else `COMSPEC`; elsewhere `SHELL`.
 */
export function resolveShell(
  platform: NodeJS.Platform,
  env: Record<string, string | undefined>,
  exists: (path: string) => boolean = existsSync,
): ShellSpec {
  if (env.DRYLAND_SHELL) return { file: env.DRYLAND_SHELL, args: parseArgs(env.DRYLAND_SHELL_ARGS) };
  if (platform === "win32") {
    const powershell = findOnPath(["pwsh.exe", "powershell.exe"], env.PATH ?? env.Path ?? "", exists);
    return { file: powershell ?? (env.COMSPEC || "cmd.exe"), args: [] };
  }
  return { file: env.SHELL || "/bin/sh", args: [] };
}
