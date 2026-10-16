/** How much of a terminal's newest output the main process keeps, in UTF-16 code units: about a long session's screenful of scrollback. */
export const OUTPUT_LIMIT = 512 * 1024;

/** A terminal's newest output, kept within a bound so a hidden session can be shown again with what it printed. */
export interface OutputBuffer {
  append(chunk: string): void;
  /** At most `limit` of the newest output; when older output was dropped, from the first line start in what is kept. */
  text(): string;
}

export function createOutputBuffer(limit = OUTPUT_LIMIT): OutputBuffer {
  const chunks: string[] = [];
  let length = 0;
  return {
    append(chunk) {
      if (chunk === "") return;
      chunks.push(chunk);
      length += chunk.length;
      // Whole chunks only, so appending stays cheap; `text` trims the rest.
      while (chunks.length > 1 && length - chunks[0]!.length >= limit) length -= chunks.shift()!.length;
    },
    text() {
      const all = chunks.join("");
      if (all.length <= limit) return all;
      const kept = all.slice(all.length - limit);
      // A cut can fall inside an escape sequence or a character, which would print as garbage; a line start cannot.
      const lineStart = kept.indexOf("\n");
      return lineStart === -1 ? kept : kept.slice(lineStart + 1);
    },
  };
}
