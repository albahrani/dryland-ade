import type { TrackerKind } from "@dryland/core";

/** How often a remote tracker is re-read while the window keeps its focus. No webhooks (spec). */
export const TRACKER_POLL_INTERVAL_MS = 60_000;

/**
 * Re-reads a GitHub or GitLab project's tickets on a timer and when the window regains focus. Local markdown is
 * watched on disk instead, so it is never polled. One reload at a time: a tick or focus that finds one running
 * skips, because that reload reads the newest state anyway.
 */
export class TrackerPoller {
  private timer: NodeJS.Timeout | undefined;
  private polling = false;
  private running = false;

  constructor(
    private readonly reload: () => Promise<void>,
    private readonly intervalMs: number = TRACKER_POLL_INTERVAL_MS,
  ) {}

  /** Whether a remote project is being polled. */
  get active(): boolean {
    return this.polling;
  }

  /** Polls a project of tracker `kind`, replacing the project polled before; local markdown polls nothing. */
  start(kind: TrackerKind): void {
    this.stop();
    if (kind === "local-markdown") return;
    this.polling = true;
    this.timer = setInterval(() => void this.focus(), this.intervalMs);
  }

  stop(): void {
    this.polling = false;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Reloads now when a remote project is polled; the window calls this on focus. */
  async focus(): Promise<void> {
    if (!this.polling || this.running) return;
    this.running = true;
    try {
      await this.reload();
    } catch (error) {
      console.warn("The remote tracker was not re-read.", error);
    } finally {
      this.running = false;
    }
  }
}
