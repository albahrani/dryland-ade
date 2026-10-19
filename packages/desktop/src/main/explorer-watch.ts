import { type FSWatcher, watch } from "node:fs";
import { join } from "node:path";

/** The files in a git directory whose change means a commit, checkout or staging: `HEAD`, its reflog and the index. */
const GIT_SIGNALS = new Set(["HEAD", "index"]);

/**
 * Watches the directories the Explorer has open, each one alone: a recursive watch of a worktree would reach into
 * `node_modules` and the like. `onChange` is called once after a burst of changes.
 */
export function createExplorerWatcher(onChange: () => void, debounceMs = 100) {
  let timer: NodeJS.Timeout | undefined;
  const watchers = new Map<string, FSWatcher>();
  const fire = () => {
    clearTimeout(timer);
    timer = setTimeout(onChange, debounceMs);
  };
  const close = (key: string) => {
    watchers.get(key)?.close();
    watchers.delete(key);
  };
  return {
    /**
     * Watches exactly `dirs` (relative to `root`, `""` for the root) and drops the watchers of any other. With
     * `gitDir`, a commit, checkout or staging in it is reported too, though no working file changed.
     */
    set(root: string, dirs: readonly string[], gitDir?: string): void {
      const wanted = new Map<string, (file: string | null) => void>();
      for (const dir of dirs) wanted.set(join(root, dir), fire);
      if (gitDir !== undefined) {
        const signal = (file: string | null) => file !== null && GIT_SIGNALS.has(file) && fire();
        wanted.set(gitDir, signal);
        wanted.set(join(gitDir, "logs"), signal);
      }
      for (const key of [...watchers.keys()]) if (!wanted.has(key)) close(key);
      for (const [key, listener] of wanted) {
        if (watchers.has(key)) continue;
        try {
          const watcher = watch(key, (_event, file) => listener(file === null ? null : String(file)));
          watcher.on("error", () => close(key)); // a vanished directory must not crash the app
          watchers.set(key, watcher);
        } catch {
          // gone already: the listing the change triggers drops it
        }
      }
    },
    stop(): void {
      clearTimeout(timer);
      for (const key of [...watchers.keys()]) close(key);
    },
  };
}
