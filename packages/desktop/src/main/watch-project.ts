import { type FSWatcher, watch } from "node:fs";
import { join } from "node:path";

/** Where tracker files live, relative to the main checkout. */
const WATCHED = [".scratch", join("docs", "agents")];

/**
 * Calls `onChange` once after a burst of changes under the tracker directories of `mainCheckout`.
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
    for (const directory of WATCHED) {
      if (armed.has(directory)) continue;
      try {
        const watcher = watch(join(mainCheckout, directory), { recursive: true }, fire);
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
