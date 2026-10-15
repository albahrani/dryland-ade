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
  timing: PretypeTiming;
}

/**
 * Types `text` into an interactive CLI without submitting it: once its output has paused and that output shows no
 * blocking screen, one key at a time and never Enter. Returns the listener to feed the CLI's output; it types once.
 */
export function createPretyper({ text, write, blocks, timing }: PretypeOptions): (output: string) => void {
  let seen = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let typing = false;

  async function typeAll(): Promise<void> {
    for (const key of text) {
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

  return (output) => {
    if (typing) return;
    // A CLI that never pauses would grow this without end; a prompt fits in the tail.
    seen = (seen + output).slice(-SEEN_LIMIT);
    clearTimeout(timer);
    timer = setTimeout(onQuiet, timing.quietMs);
  };
}
