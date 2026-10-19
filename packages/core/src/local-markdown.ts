import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { byTicketNumber, TICKET_TYPES, type Ticket, type TicketState, type TicketType } from "./ticket.ts";
import { defaultTriageVocabulary, type TriageVocabulary } from "./triage-labels.ts";

const TICKET_FILE = /^(\d+)-.+\.md$/;
const ANNOTATION_LINE = /^[ \t]*<!--\s*dryland:[\s\S]*?-->[ \t]*(?:\n|$)/gm;
const ANNOTATION = /[ \t]*<!--\s*dryland:[\s\S]*?-->/g;
const FIELD_LINE = /^([A-Za-z][A-Za-z -]*?):[ \t]*(.*)$/;
const INTERPRETED_FIELDS = new Set(["type", "status", "blocked by"]);

/** Removes Dryland-owned `<!-- dryland: ... -->` annotations, so no parser result depends on them. */
export function stripAnnotations(markdown: string): string {
  return markdown.replace(/\r\n/g, "\n").replace(ANNOTATION_LINE, "").replace(ANNOTATION, "");
}

/** The line ending a file uses, so a rewrite keeps it. */
export const lineEnding = (markdown: string): string => (markdown.includes("\r\n") ? "\r\n" : "\n");

export interface ClaimRecord {
  holder: string;
  /** ISO timestamp of the claim. */
  at: string;
  /** The `Status:` value the ticket had before the claim, restored on release; empty when it had none. */
  was: string;
}

const CLAIM_ANNOTATION = /<!--\s*dryland:\s*(\{[\s\S]*?\})\s*-->/;
const CLAIM_ANNOTATION_LINE = new RegExp(`^[ \t]*${CLAIM_ANNOTATION.source}[ \t]*$`);

/** The claim a ticket file records in its Dryland annotation, if any. */
export function readClaim(markdown: string): ClaimRecord | null {
  // Only the header can carry a claim; an annotation further down is prose and is never read.
  const sections = markdown.search(/^## /m);
  const json = CLAIM_ANNOTATION.exec(sections === -1 ? markdown : markdown.slice(0, sections))?.[1];
  if (json === undefined) return null;
  try {
    const claim = (JSON.parse(json) as { claim?: Partial<ClaimRecord> }).claim;
    if (typeof claim?.holder !== "string" || typeof claim.at !== "string") return null;
    return { holder: claim.holder, at: claim.at, was: typeof claim.was === "string" ? claim.was : "" };
  } catch {
    return null;
  }
}

function claimAnnotation(claim: ClaimRecord): string {
  // `>` is escaped so no holder name can close the comment early.
  return `<!-- dryland: ${JSON.stringify({ claim }).replaceAll(">", "\\u003e")} -->`;
}

/**
 * Rewrites one header field of a ticket: `replace` gets the field's current value (`""` when absent) and
 * returns the lines to put there, none to remove it. A field that is absent goes after the header fields
 * that come before it (`Type:`, `Status:`, `Blocked by:`), or under the title. With `dropAnnotations` the Dryland annotation lines of the header go too.
 * Everything else in the file, including line endings, is left as it was.
 */
function rewriteHeaderField(
  markdown: string,
  field: string,
  replace: (current: string) => string[],
  options: { dropAnnotations: boolean } = { dropAnnotations: false },
): string {
  // Lines keep their own terminators, so a file with mixed line endings is not normalised.
  const lines = markdown.split(/(?<=\n)/);
  const fileEol = lineEnding(markdown);
  const text = (line: string) => line.replace(/\r?\n$/, "");
  const titleIndex = lines.findIndex((line) => line.startsWith("# "));

  let fieldIndex = -1;
  const annotationIndexes = new Set<number>();
  // The header block is the run of lines from the first field to the next blank line. A field further
  // down is still found and rewritten, but a missing one is only ever added inside the block.
  let blockStarted = false;
  let blockEnded = false;
  let typeEnd = titleIndex;
  let statusEnd = -1;
  for (let i = titleIndex + 1; i < lines.length; i++) {
    const line = text(lines[i] ?? "");
    if (line.trim() === "") {
      if (blockStarted) blockEnded = true;
      continue;
    }
    if (CLAIM_ANNOTATION_LINE.test(line)) {
      annotationIndexes.add(i);
      blockStarted = true;
      if (!blockEnded) statusEnd = i;
      continue;
    }
    const match = FIELD_LINE.exec(line);
    if (match?.[1] === undefined) break;
    const key = match[1].toLowerCase();
    if (key === field && fieldIndex === -1) fieldIndex = i;
    blockStarted = true;
    if (blockEnded) continue;
    if (key === "type") typeEnd = i;
    else if (key === "status" || key === "blocked by") statusEnd = i;
  }
  // `Type:`, then `Status:` with its annotation, then `Blocked by:`.
  const afterIndex = field === "status" ? typeEnd : statusEnd === -1 ? typeEnd : statusEnd;

  const current = fieldIndex === -1 ? "" : (FIELD_LINE.exec(text(lines[fieldIndex] ?? ""))?.[2] ?? "").trim();
  const replacement = replace(current);
  /** `texts` as lines that end the way `like` does; a `like` with no ending at the end of the file gets none. */
  const asLines = (texts: string[], like: string) => {
    const own = /\r?\n$/.exec(like)?.[0] ?? "";
    return texts.map((t, i) => `${t}${i === texts.length - 1 ? own : own || fileEol}`);
  };

  const insertAfter = fieldIndex === -1 ? afterIndex : -1;
  const out: string[] = [];
  lines.forEach((line, i) => {
    const dropped = options.dropAnnotations && annotationIndexes.has(i);
    if (i === fieldIndex) out.push(...asLines(replacement, line));
    else if (!dropped) out.push(line);
    if (i === insertAfter && replacement.length > 0) {
      if (!dropped && !/\n$/.test(line)) out[out.length - 1] = `${line}${fileEol}`;
      if (i === titleIndex) out.push(/\r?\n$/.exec(line)?.[0] ?? fileEol);
      out.push(...asLines(replacement, line));
    }
  });
  return out.join("");
}

/**
 * Rewrites only the header lines a claim, release, resolve or triage touches: `Status:` and the Dryland
 * annotation line under it. A claim stores the previous status in the annotation, so a release can put it
 * back; a resolve replaces both; `set` writes the given status.
 */
export function rewriteStatus(
  markdown: string,
  change: { claim: Omit<ClaimRecord, "was"> } | { release: true } | { resolve: true } | { set: string },
): string {
  const existing = readClaim(markdown);
  return rewriteHeaderField(
    markdown,
    "status",
    (currentStatus) => {
      if ("claim" in change) return ["Status: claimed", claimAnnotation({ ...change.claim, was: currentStatus })];
      if ("set" in change) return [`Status: ${change.set}`];
      // Any claim annotation is dropped, and the status it remembered is no longer wanted.
      if ("resolve" in change) return ["Status: resolved"];
      const was = currentStatus.toLowerCase() === "claimed" ? (existing?.was ?? "") : currentStatus;
      return was === "" ? [] : [`Status: ${was}`];
    },
    { dropAnnotations: true },
  );
}

/** Rewrites only the `Blocked by:` header line: `ids` replace it, or remove it when empty. */
export function rewriteBlockedBy(markdown: string, ids: string[]): string {
  return rewriteHeaderField(markdown, "blocked by", () => (ids.length === 0 ? [] : [`Blocked by: ${ids.join(", ")}`]));
}

/**
 * Where the `## ` section with this heading (case-insensitive) sits in `lines`: its heading line and the
 * line of the next `## ` heading, or the end. Fenced code is skipped. Lines may carry their terminators.
 */
function findSectionRange(lines: string[], heading: string): { start: number; end: number } | null {
  let fenced = false;
  let start = -1;
  let end = lines.length;
  lines.forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced || !line.startsWith("## ")) return;
    if (start === -1 && line.slice(3).trim().toLowerCase() === heading.toLowerCase()) start = i;
    else if (start !== -1 && end === lines.length) end = i;
  });
  return start === -1 ? null : { start, end };
}

/**
 * Appends `entry` (one or more lines) as the last entry of the section with this `## ` heading, or creates
 * the section at the end of the file. Every other line is kept with its own line ending. In a `list` section
 * a bare "Nothing." placeholder gives way to the entry and a loose list stays loose; in a `paragraph` section
 * the entry follows a blank line.
 */
function appendToSection(markdown: string, heading: string, entry: string, style: "paragraph" | "list"): string {
  const lines = markdown.split(/(?<=\n)/);
  const fileEol = lineEnding(markdown);
  const text = (line: string) => line.replace(/\r?\n$/, "");
  const endingOf = (line: string) => /\r?\n$/.exec(line)?.[0] ?? fileEol;
  const isBlank = (line: string | undefined) => text(line ?? "").trim() === "";
  const entryLines = (eol: string) => entry.split(/\r?\n/).map((line) => `${line}${eol}`);

  const range = findSectionRange(lines, heading);
  if (range === null) {
    const last = lines.length - 1;
    if (last >= 0 && !/\n$/.test(lines[last] ?? "")) lines[last] += fileEol;
    const spacing = last >= 0 && !isBlank(lines[last]) ? [fileEol] : [];
    return [...lines, ...spacing, `## ${heading}${fileEol}`, fileEol, ...entryLines(fileEol)].join("");
  }

  const { start, end } = range;
  const filled: number[] = [];
  for (let i = start + 1; i < end; i++) if (!isBlank(lines[i])) filled.push(i);
  const first = filled[0];
  const last = filled[filled.length - 1];

  if (first === undefined || last === undefined) {
    const headingLine = lines[start] ?? "";
    const eol = endingOf(headingLine);
    lines[start] = /\n$/.test(headingLine) ? headingLine : `${headingLine}${eol}`;
    lines.splice(start + 1, 0, eol, ...entryLines(eol));
    return lines.join("");
  }
  // Only the bare placeholder of the map template gives way; a real decision that starts "None of..." stays.
  if (style === "list" && first === last && /^(nothing|none)\.?$/i.test(text(lines[first] ?? "").trim())) {
    lines.splice(first, 1, ...entryLines(endingOf(lines[first] ?? "")));
    return lines.join("");
  }

  const lastLine = lines[last] ?? "";
  const eol = endingOf(lastLine);
  const unterminated = !/\n$/.test(lastLine);
  if (unterminated) lines[last] = `${lastLine}${eol}`;
  // A list keeps its spacing: a blank line between entries stays between entries.
  const loose = style === "paragraph" || last - first + 1 > filled.length;
  const added = [...(loose ? [eol] : []), ...entryLines(eol)];
  // Only the end of the file lacks a terminator, and the file then still ends without one.
  if (unterminated) added[added.length - 1] = (added[added.length - 1] ?? "").slice(0, -eol.length);
  // An entry directly above the next heading keeps a blank line between them.
  if (style === "paragraph" && end < lines.length && last === end - 1) added.push(eol);
  lines.splice(last + 1, 0, ...added);
  return lines.join("");
}

/** Appends a comment under `## Comments`, creating the heading when it is missing. Earlier lines are untouched. */
export function appendComment(markdown: string, comment: string): string {
  return appendToSection(markdown, "Comments", comment, "paragraph");
}

/**
 * Appends one bullet to the `## Decisions so far` section, or creates the section at the end of the file.
 * A lone "Nothing." placeholder gives way to the entry. Every other line is kept with its own line ending.
 */
export function appendDecision(markdown: string, entry: string): string {
  return appendToSection(markdown, "Decisions so far", entry, "list");
}

/** Removes every HTML comment, e.g. the guidance comments in wayfinder's map template. */
export function stripHtmlComments(markdown: string): string {
  return markdown.replace(/<!--[\s\S]*?-->/g, "");
}

export interface MarkdownSection {
  heading: string;
  content: string;
}

/** The content of the section with this lower-case heading, if there is one. */
export function findSection(sections: MarkdownSection[], heading: string): string | undefined {
  return sections.find((s) => s.heading.toLowerCase() === heading)?.content;
}

/** Splits lines into the text before the first `## ` heading and the `## ` sections after it. */
export function splitSections(lines: string[]): { preamble: string[]; sections: MarkdownSection[] } {
  let fenced = false;
  const first = lines.findIndex((line) => {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    return !fenced && line.startsWith("## ");
  });
  if (first === -1) return { preamble: lines, sections: [] };
  const sections: MarkdownSection[] = [];
  let inFence = false;
  let current: { heading: string; lines: string[] } | null = null;
  const flush = () => {
    if (current) sections.push({ heading: current.heading, content: current.lines.join("\n").trim() });
  };
  for (const line of lines.slice(first)) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (!inFence && line.startsWith("## ")) {
      flush();
      current = { heading: line.slice(3).trim(), lines: [] };
    } else {
      current?.lines.push(line);
    }
  }
  flush();
  return { preamble: lines.slice(0, first), sections };
}

/** `claimed` and `resolved` are states; any other status (a triage role, nothing) leaves the ticket open. */
function stateOf(status: string | undefined): TicketState {
  const value = status?.toLowerCase();
  return value === "resolved" || value === "claimed" ? value : "open";
}

/** Ticket numbers on a `Blocked by:` line. A non-empty value without any number is not guessed at. */
function blockersOf(value: string | undefined): string[] | "unknown" {
  const text = value ?? "";
  const ids = text.match(/\d+/g) ?? [];
  return ids.length === 0 && text.trim() !== "" ? "unknown" : ids;
}

/** Splits a `## Comments` section into comments at `### ` headings and `---` rules. */
function commentsOf(section: string | undefined): string[] {
  const comments: string[] = [];
  let current: string[] = [];
  const flush = () => {
    const text = current.join("\n").trim();
    if (text !== "") comments.push(text);
    current = [];
  };
  for (const line of (section ?? "").split("\n")) {
    const rule = /^-{3,}\s*$/.test(line);
    if (rule || line.startsWith("### ")) flush();
    if (!rule) current.push(line);
  }
  flush();
  return comments;
}

export function parseTicketFile(
  map: string,
  id: string,
  markdown: string,
  vocabulary: TriageVocabulary = defaultTriageVocabulary(),
): Ticket {
  const claim = readClaim(markdown);
  const { preamble, sections } = splitSections(stripAnnotations(markdown).split("\n"));
  const titleIndex = preamble.findIndex((line) => line.startsWith("# "));
  const title = titleIndex === -1 ? "" : (preamble[titleIndex] ?? "").slice(2).trim();

  // Header fields are the `Key: value` lines directly under the title; the body starts at the first other line.
  const fields = new Map<string, string>();
  const raw: Record<string, string> = {};
  let bodyStart = titleIndex + 1;
  for (; bodyStart < preamble.length; bodyStart++) {
    const line = preamble[bodyStart] ?? "";
    if (line.trim() === "") continue;
    const match = FIELD_LINE.exec(line);
    if (match?.[1] === undefined) break;
    const key = match[1].toLowerCase();
    const value = (match[2] ?? "").trim();
    if (INTERPRETED_FIELDS.has(key)) {
      if (!fields.has(key)) fields.set(key, value);
    } else if (!(match[1] in raw)) {
      raw[match[1]] = value;
    }
  }

  const section = (name: string) => findSection(sections, name);
  const bodySections = sections.filter((s) => !["answer", "comments"].includes(s.heading.toLowerCase()));
  const body = [preamble.slice(bodyStart).join("\n"), ...bodySections.map((s) => `## ${s.heading}\n\n${s.content}`)]
    .join("\n")
    .trim();

  const status = fields.get("status");
  const state = stateOf(status);
  const rawType = fields.get("type")?.toLowerCase();
  const type: TicketType = TICKET_TYPES.find((known) => known === rawType) ?? "none";

  return {
    id,
    map,
    title,
    type,
    state,
    // The default skill format records no assignee; a claim made by `dryland` adds an annotation.
    claimant: state === "claimed" ? (claim?.holder ?? null) : null,
    blockers: blockersOf(fields.get("blocked by")),
    triageRole: state === "open" && status ? (vocabulary.get(status.toLowerCase()) ?? null) : null,
    body,
    answer: section("answer") ?? null,
    comments: commentsOf(section("comments")),
    raw,
  };
}

/** The directory of a map's tickets, relative to the main checkout, with forward slashes. */
export const issuesDir = (map: string): string => `.scratch/${map}/issues`;

/** The numbers, as written in the file names (`01`, `20`), of a map's ticket files. */
export async function ticketNumbers(mainCheckout: string, map: string): Promise<string[]> {
  const files = await readdir(join(mainCheckout, issuesDir(map))).catch(() => []);
  return files.flatMap((name) => TICKET_FILE.exec(name)?.[1] ?? []);
}

/** The file of a ticket, relative to the main checkout, with forward slashes. */
export async function ticketFile(mainCheckout: string, map: string, id: string): Promise<string | null> {
  const files = await readdir(join(mainCheckout, issuesDir(map))).catch(() => []);
  const file = files.find((name) => TICKET_FILE.exec(name)?.[1] === id);
  return file === undefined ? null : `${issuesDir(map)}/${file}`;
}

/** Reads every `.scratch/<map>/issues/NN-*.md` under `mainCheckout`, ordered by map then number. */
export async function readLocalMarkdownTickets(
  mainCheckout: string,
  vocabulary: TriageVocabulary = defaultTriageVocabulary(),
): Promise<Ticket[]> {
  const scratch = join(mainCheckout, ".scratch");
  const maps = await readdir(scratch, { withFileTypes: true }).catch(() => []);
  const tickets: Ticket[] = [];
  for (const map of maps
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()) {
    const dir = join(scratch, map, "issues");
    const files = await readdir(dir).catch(() => []);
    for (const file of files) {
      const match = TICKET_FILE.exec(file);
      if (!match?.[1]) continue;
      tickets.push(parseTicketFile(map, match[1], await readFile(join(dir, file), "utf8"), vocabulary));
    }
  }
  return tickets.sort(byTicketNumber);
}
