import { type FSWatcher, watch } from "node:fs";
import { join } from "node:path";
import { readStoreHead } from "@dryland/core";

/** The only directory of the checkout the app reads: the specs under `.scratch/<effort>/spec.md`. */
const SPECS = ".scratch";

/**
 * Calls `onChange` once after a burst of changes under `.scratch` of `mainCheckout`, or when the head of the state
 * ref moves (polled every `pollMs`, since the store sits outside the checkout). A `.scratch` that does not exist yet
 * is picked up when it appears. Returns a stop function.
 */
export function watchProject(mainCheckout: string, onChange: () => void, debounceMs = 100, pollMs = 1000): () => void {
  let timer: NodeJS.Timeout | undefined;
  const fire = () => {
    clearTimeout(timer);
    timer = setTimeout(onChange, debounceMs);
  };
  const watchers: FSWatcher[] = [];
  let armed = false;
  const arm = () => {
    if (armed) return;
    try {
      const watcher = watch(join(mainCheckout, SPECS), { recursive: true }, fire);
      watcher.on("error", () => undefined); // a vanished directory must not crash the app
      watchers.push(watcher);
      armed = true;
    } catch {
      // directory missing: the checkout watcher below arms it when it appears
    }
  };
  arm();
  // Top-level entries only: a new `.scratch` directory arms its watcher and refreshes the tree.
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
  tick(); // the baseline; a write before this first read lands is not seen, the open already shows it
  const poll = setInterval(tick, pollMs);
  return () => {
    clearTimeout(timer);
    clearInterval(poll);
    for (const watcher of watchers) watcher.close();
  };
}
