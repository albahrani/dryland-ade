export interface PretypeTiming {
  /** How long the CLI's output must pause before its prompt counts as drawn. */
  quietMs: number;
  /** The pause between keys; a whole string in one write is dropped by Claude Code on Windows. */
  charDelayMs: number;
}

/** Verified against Claude Code 2.1.300 on Windows (research notes, ticket 33). */
export const PRETYPE_TIMING: PretypeTiming = { quietMs: 500, charDelayMs: 15 };

const SEEN_LIMIT = 64 * 1024;

export interface PretypeOptions {
  text: string;
  /** Sends one key to the CLI; a no-op once its terminal is gone. */
  write(key: string): void;
  /** Whether output seen since the last pause shows a screen keys must not reach, such as a trust dialog. */
  blocks(output: string): boolean;
  /** Whether to press Enter once the text is typed (the auto-submit setting). */
  submit: boolean;
  timing: PretypeTiming;
}

/** The listener to feed a CLI's output, and the way to stand it down. */
export type Pretyper = ((output: string) => void) & {
  /** The user typed: nothing more is typed and nothing is submitted, so their keys never mix with ours. */
  cancel(): void;
};

/**
 * Types `text` into an interactive CLI: once its output has paused and that output shows no blocking screen, one
 * key at a time, and Enter after it only when `submit` is set. Returns the listener to feed the CLI's output; it
 * types once, and stops for good when cancelled.
 */
export function createPretyper({ text, write, blocks, submit, timing }: PretypeOptions): Pretyper {
  let seen = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let typing = false;
  let cancelled = false;

  async function typeAll(): Promise<void> {
    const keys = submit ? [...text, "\r"] : [...text];
    for (const key of keys) {
      if (cancelled) return;
      write(key);
      if (timing.charDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, timing.charDelayMs));
    }
  }

  function onQuiet(): void {
    // A blocking screen waits for the user; the CLI redraws once they answer, and that output is judged afresh.
    if (blocks(seen)) {
      seen = "";
      return;
    }
    typing = true;
    void typeAll();
  }

  const listener = (output: string): void => {
    if (typing || cancelled) return;
    // A CLI that never pauses would grow this without end; a prompt fits in the tail.
    seen = (seen + output).slice(-SEEN_LIMIT);
    clearTimeout(timer);
    timer = setTimeout(onQuiet, timing.quietMs);
  };
  return Object.assign(listener, {
    cancel() {
      cancelled = true;
      clearTimeout(timer);
    },
  });
}

/**
 * Whether `data`, written to a terminal from the renderer, is the user typing: the renderer's terminal also writes
 * its replies to the CLI's queries (cursor position, device attributes, focus), which are control sequences.
 */
export function isKeystroke(data: string): boolean {
  return typeof data === "string" && data !== "" && !/^\x1b[[\]PO]/.test(data);
}
