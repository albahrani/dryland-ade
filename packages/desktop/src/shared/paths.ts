/** The last segment of a worktree-relative path (`/`-separated): the file's name. */
export const baseName = (path: string): string => path.split("/").at(-1) ?? path;

/** The directory a worktree-relative path (`/`-separated) is in; `""` for the worktree's top. */
export const dirName = (path: string): string => path.split("/").slice(0, -1).join("/");

/** Whether `path`, which came from the renderer, is relative and never steps out through a `..` segment. */
export const isRelativeInside = (path: string): boolean =>
  !/^([\\/]|[a-zA-Z]:)/.test(path) && !path.split(/[\\/]/).includes("..");
