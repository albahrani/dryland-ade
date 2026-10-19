import hljs from "highlight.js/lib/common";
import { baseName } from "../../shared/paths.ts";

/** Beyond this the highlighter would stall the window; the file shows as plain text. */
const MAX_HIGHLIGHT_CHARS = 200_000;

/** Extensions the highlighter does not know by name, and the language that reads them. */
const EXTENSION_LANGUAGE: Readonly<Record<string, string>> = {
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  mts: "typescript",
  cts: "typescript",
  tsx: "typescript",
};

/** Files with no extension that name their language. */
const FILE_LANGUAGE: Readonly<Record<string, string>> = { Makefile: "makefile", GNUmakefile: "makefile" };

/** `text` as highlighted HTML (escaped by the highlighter), or `null` when its language is unknown or it is too big. */
export function highlightCode(text: string, path: string): string | null {
  if (text.length > MAX_HIGHLIGHT_CHARS) return null;
  const name = baseName(path);
  const extension = name.includes(".") ? (name.split(".").at(-1)?.toLowerCase() ?? "") : "";
  const language = FILE_LANGUAGE[name] ?? EXTENSION_LANGUAGE[extension] ?? extension;
  if (!hljs.getLanguage(language)) return null;
  return hljs.highlight(text, { language, ignoreIllegals: true }).value;
}
