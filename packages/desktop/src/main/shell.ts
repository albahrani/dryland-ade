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

/** The shell a new terminal runs: `DRYLAND_SHELL` (with JSON `DRYLAND_SHELL_ARGS`) if set, else the user's own. */
export function resolveShell(platform: NodeJS.Platform, env: Record<string, string | undefined>): ShellSpec {
  if (env.DRYLAND_SHELL) return { file: env.DRYLAND_SHELL, args: parseArgs(env.DRYLAND_SHELL_ARGS) };
  if (platform === "win32") return { file: env.COMSPEC || "cmd.exe", args: [] };
  return { file: env.SHELL || "/bin/sh", args: [] };
}
