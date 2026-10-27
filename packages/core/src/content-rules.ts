import type { Diagnostic } from "./documents.ts";

// The content rules of the write pipeline's check step: a cap per field kind and the lint every prose field passes.
// Over-cap or linted text is rejected with the rule stated, never shortened or fixed on the writer's behalf.

/** Characters allowed per field kind. */
export const CAPS = { title: 60, report: 1200, summary: 600 } as const;

export type CappedField = keyof typeof CAPS;

/** The longest sentence lint accepts, in words. */
export const MAX_SENTENCE_WORDS = 30;

const HEDGES =
  /\b(?:perhaps|maybe|might|possibly|probably|presumably|arguably|hopefully|somewhat|i think|i guess|it seems|seems to|sort of|kind of)\b/i;
const FILLER =
  /\b(?:basically|actually|really|very|simply|obviously|clearly|essentially|in order to|needless to say|it should be noted|it is worth noting)\b/i;
// A file path: a drive or root, `./`, or a slashed name ending in an extension. `shop/01` is a ticket reference.
const PATH = /(?:\b[A-Za-z]:[\\/]|(?:^|[\s(])\.{0,2}\/[\w.-]+|\b[\w.-]+(?:[\\/][\w.-]+)*[\\/][\w-]+\.[A-Za-z]{1,5}\b)/;
const LINE_NUMBER = /\b(?:lines?\s+\d+|L\d+\b|\.[A-Za-z]{1,5}:\d+)/i;
// `#12`, or a number after "ticket"/"issue" with no `effort/` before it.
const BARE_ID = /(?:#\d+\b|\b(?:ticket|issue)\s+\d+\b)/i;

interface Rule {
  id: string;
  test: (text: string) => string | null;
  fix: string;
}

const matching =
  (pattern: RegExp, what: string) =>
  (text: string): string | null => {
    const hit = pattern.exec(text);
    return hit === null ? null : `${what} "${hit[0].trim()}".`;
  };

const sentences = (text: string): string[] => text.split(/(?<=[.!?])\s+|\r?\n+/).filter((s) => s.trim() !== "");

const RULES: Rule[] = [
  { id: "hedge", test: matching(HEDGES, "Hedge"), fix: "State it plainly, or drop the claim you are unsure of." },
  { id: "filler", test: matching(FILLER, "Filler"), fix: "Delete the word; the sentence says the same without it." },
  {
    id: "long-sentence",
    test: (text) => {
      const long = sentences(text).find((s) => s.trim().split(/\s+/).length > MAX_SENTENCE_WORDS);
      return long === undefined
        ? null
        : `A sentence runs over ${MAX_SENTENCE_WORDS} words: "${long.trim().slice(0, 40)}...".`;
    },
    fix: `Split it into sentences of at most ${MAX_SENTENCE_WORDS} words.`,
  },
  {
    id: "path",
    test: matching(PATH, "File path"),
    fix: "Name the thing (module, command, screen) instead of where it lives.",
  },
  {
    id: "line-number",
    test: matching(LINE_NUMBER, "Line number"),
    fix: "Describe the code by what it does; line numbers go stale.",
  },
  {
    id: "bare-id",
    test: matching(BARE_ID, "Bare id"),
    fix: "Write tickets as effort/NN, e.g. shop/01, and add a few words saying what it is.",
  },
];

/** The problems of `text` as the `field` kind at `path`: over its cap, then each lint rule it breaks. */
export function checkProse(path: string, field: CappedField, text: string): Diagnostic[] {
  const out: Diagnostic[] = [];
  const cap = CAPS[field];
  if (text.trim().length > cap) {
    out.push({
      path,
      rule: "over-cap",
      problem: `${text.trim().length} characters; the ${field} cap is ${cap}.`,
      fix: `Shorten it to at most ${cap} characters. Nothing is truncated for you.`,
    });
  }
  for (const rule of RULES) {
    const problem = rule.test(text);
    if (problem !== null) out.push({ path, rule: `lint-${rule.id}`, problem, fix: rule.fix });
  }
  return out;
}
