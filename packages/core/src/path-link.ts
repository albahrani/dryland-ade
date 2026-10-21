import { lstat, mkdir, readlink, rm, symlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DrylandError } from "./errors.ts";

export interface PathLinkOptions {
  /** The installed launcher to link to; the launcher exports it as `DRYLAND_LAUNCHER`. */
  launcher: string | undefined;
  /** The user's home, where `.local/bin` lives; defaults to the real one. */
  home?: string;
}

/** Where `dryland doctor --link-path` puts the link: a directory most Linux and macOS shells already have on `PATH`. */
export const pathLinkFile = (home = homedir()) => join(home, ".local", "bin", "dryland");

function requireSymlinkPlatform(): void {
  if (process.platform === "win32") {
    throw new DrylandError(
      "A PATH link is a symlink, which Windows does not use for this.",
      "Tick the PATH option in the Dryland ADE installer, or add the install directory's resources\\bin to PATH.",
    );
  }
}

const lstatOrNull = (path: string) => lstat(path).catch(() => null);

function notALink(link: string): DrylandError {
  return new DrylandError(`${link} exists and is not a symlink.`, `Move or delete ${link}, then run this again.`);
}

/** Symlinks `~/.local/bin/dryland` to the installed launcher. Replaces a symlink, never a regular file. */
export async function linkLauncher({ launcher, home }: PathLinkOptions): Promise<string[]> {
  requireSymlinkPlatform();
  if (launcher === undefined || launcher === "") {
    throw new DrylandError(
      "This dryland is not the one the installed app ships.",
      "Run `dryland doctor --link-path` through the launcher in the app's install directory.",
    );
  }
  const link = pathLinkFile(home);
  const existing = await lstatOrNull(link);
  if (existing !== null) {
    if (!existing.isSymbolicLink()) throw notALink(link);
    if ((await readlink(link)) === launcher) return [`${link} already points to ${launcher}.`];
    await rm(link);
  }
  await mkdir(dirname(link), { recursive: true });
  await symlink(launcher, link);
  return [`Linked ${link} to ${launcher}. Make sure ${dirname(link)} is on your PATH.`];
}

/** Removes the link `linkLauncher` made; a regular file there is not Dryland's to remove. */
export async function unlinkLauncher(home?: string): Promise<string[]> {
  requireSymlinkPlatform();
  const link = pathLinkFile(home);
  const existing = await lstatOrNull(link);
  if (existing === null) return [`${link} is not linked.`];
  if (!existing.isSymbolicLink()) throw notALink(link);
  await rm(link);
  return [`Removed ${link}.`];
}
