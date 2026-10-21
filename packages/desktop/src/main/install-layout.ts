import { rmSync } from "node:fs";
import { join } from "node:path";

export interface InstallLayoutInput {
  /** `app.isPackaged`: this is an installed app, not `electron-vite dev` or a bare Electron run. */
  packaged: boolean;
  /** Electron's `process.resourcesPath`; the installer puts `bin/` there (see electron-builder.json). */
  resourcesPath: string;
  /** The CLI bundle electron-vite builds beside the main process, used when the app is not installed. */
  builtCli: string;
  /** Where the app writes the launcher shims it generates at startup. */
  userDataBin: string;
}

export interface InstallLayout {
  /** The bundled `dryland` CLI script the launcher and the app run with the app's own Electron. */
  cli: string;
  /** Directories put first on every session's `PATH`, in order. */
  pathDirs: string[];
  /** Whether the app writes the `dryland` launcher itself; an installed app ships one instead. */
  writeLauncher: boolean;
}

/** An installed app runs the launcher and single-file CLI the installer shipped; a development run writes its own. */
export function installLayout({ packaged, resourcesPath, builtCli, userDataBin }: InstallLayoutInput): InstallLayout {
  if (!packaged) return { cli: builtCli, pathDirs: [userDataBin], writeLauncher: true };
  const installBin = join(resourcesPath, "bin");
  return { cli: join(installBin, "dryland.mjs"), pathDirs: [userDataBin, installBin], writeLauncher: false };
}

/** Deletes the `dryland` launcher an earlier version left in `dir`, so it never shadows the installed one. */
export function removeStaleLauncher(dir: string): void {
  for (const name of ["dryland", "dryland.cmd"]) rmSync(join(dir, name), { force: true });
}
