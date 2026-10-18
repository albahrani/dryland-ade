import { type FSWatcher, watch } from "node:fs";
import { join } from "node:path";

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
    /** Watches exactly `dirs` (relative to `root`, `""` for the root) and drops the watchers of any other. */
    set(root: string, dirs: readonly string[]): void {
      const wanted = new Set(dirs.map((dir) => join(root, dir)));
      for (const key of [...watchers.keys()]) if (!wanted.has(key)) close(key);
      for (const key of wanted) {
        if (watchers.has(key)) continue;
        try {
          const watcher = watch(key, fire);
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
