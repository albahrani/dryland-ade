import { type FSWatcher, watch } from "node:fs";
import { join } from "node:path";
import { readStoreHead, SKILL_ROOTS } from "@dryland/core";

/** Where tracker files and skills live, relative to the main checkout. */
const WATCHED = [".scratch", join("docs", "agents"), ...SKILL_ROOTS];
/** Their parents, watched shallowly so that a directory created later is armed. */
const PARENTS = ["docs", ".claude", ".agents"];

/**
 * Calls `onChange` once after a burst of changes under the tracker and skill directories of `mainCheckout`, or when
 * the head of the state ref moves (polled every `pollMs`, since the store sits outside the checkout).
 * A directory that does not exist yet is picked up when it appears. Returns a stop function.
 */
export function watchProject(mainCheckout: string, onChange: () => void, debounceMs = 100, pollMs = 1000): () => void {
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
  let head: string | null | undefined;
  let polling = false;
  const tick = () => {
    if (polling) return;
    polling = true;
    readStoreHead(mainCheckout)
      .then((next) => {
        if (head !== undefined && next !== head) fire();
        head = next;
      })
      .catch(() => undefined) // an unreadable store is retried on the next tick
      .finally(() => {
        polling = false;
      });
  };
  tick(); // the baseline, so a write just after the watch began is seen
  const poll = setInterval(tick, pollMs);
  return () => {
    clearTimeout(timer);
    clearInterval(poll);
    for (const watcher of watchers) watcher.close();
  };
}
