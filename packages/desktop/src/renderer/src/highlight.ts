import hljs from "highlight.js/lib/common";

/** Beyond this the highlighter would stall the window; the file shows as plain text. */
const MAX_HIGHLIGHT_CHARS = 200_000;

/** `text` as highlighted HTML (escaped by the highlighter), or `null` when its language is unknown or it is too big. */
export function highlightCode(text: string, path: string): string | null {
  if (text.length > MAX_HIGHLIGHT_CHARS) return null;
  const extension = path.split("/").at(-1)?.split(".").at(-1)?.toLowerCase() ?? "";
  if (!hljs.getLanguage(extension)) return null;
  return hljs.highlight(text, { language: extension, ignoreIllegals: true }).value;
}
