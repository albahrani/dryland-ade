import { type FSWatcher, watch } from "node:fs";
import { join } from "node:path";
import { SKILL_ROOTS } from "@dryland/core";

/** Where tracker files and skills live, relative to the main checkout. */
const WATCHED = [".scratch", join("docs", "agents"), ...SKILL_ROOTS];
/** Their parents, watched shallowly so that a directory created later is armed. */
const PARENTS = ["docs", ".claude", ".agents"];

/**
 * Calls `onChange` once after a burst of changes under the tracker and skill directories of `mainCheckout`.
 * A directory that does not exist yet is picked up when it appears. Returns a stop function.
 */
export function watchProject(mainCheckout: string, onChange: () => void, debounceMs = 100): () => void {
  let timer: NodeJS.Timeout | undefined;
  const fire = () => {
    clearTimeout(timer);
    timer = setTimeout(onChange, debounceMs);
  };
  const watchers: FSWatcher[] = [];
  const armed = new Set<string>();
  const arm = () => {
    const targets = [
      ...WATCHED.map((directory) => ({ directory, recursive: true, listener: fire })),
      ...PARENTS.map((directory) => ({
        directory,
        recursive: false,
        listener: () => {
          arm();
          fire();
        },
      })),
    ];
    for (const { directory, recursive, listener } of targets) {
      if (armed.has(directory)) continue;
      try {
        const watcher = watch(join(mainCheckout, directory), { recursive }, listener);
        watcher.on("error", () => undefined); // a vanished directory must not crash the app
        watchers.push(watcher);
        armed.add(directory);
      } catch {
        // directory missing: the checkout watcher below re-arms when it appears
      }
    }
  };
  arm();
  // Top-level entries only: a new `.scratch` or `docs` directory arms its watcher and refreshes the tree.
  const top = watch(mainCheckout, () => {
    arm();
    fire();
  });
  top.on("error", () => undefined);
  watchers.push(top);
  return () => {
    clearTimeout(timer);
    for (const watcher of watchers) watcher.close();
  };
}
