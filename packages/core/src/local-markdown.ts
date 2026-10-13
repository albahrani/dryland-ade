import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { TICKET_TYPES, type Ticket, type TicketState, type TicketType } from "./ticket.ts";
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
 * Rewrites only the header lines a claim touches: `Status:` and the Dryland annotation line under it.
 * A claim stores the previous status in the annotation, so a release can put it back. Everything else
 * in the file, including line endings, is left as it was.
 */
export function rewriteClaim(
  markdown: string,
  change: { claim: Omit<ClaimRecord, "was"> } | { release: true } | { resolve: true },
): string {
  const eol = markdown.includes("\r\n") ? "\r\n" : "\n";
  const lines = markdown.split(/\r?\n/);
  const titleIndex = lines.findIndex((line) => line.startsWith("# "));

  let statusIndex = -1;
  let lastFieldIndex = titleIndex;
  const annotationIndexes = new Set<number>();
  for (let i = titleIndex + 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.trim() === "") continue;
    if (CLAIM_ANNOTATION_LINE.test(line)) {
      annotationIndexes.add(i);
      lastFieldIndex = i;
      continue;
    }
    const match = FIELD_LINE.exec(line);
    if (match?.[1] === undefined) break;
    if (match[1].toLowerCase() === "status" && statusIndex === -1) statusIndex = i;
    lastFieldIndex = i;
  }

  const existing = readClaim(markdown);
  const currentStatus = statusIndex === -1 ? "" : (FIELD_LINE.exec(lines[statusIndex] ?? "")?.[2] ?? "").trim();
  let replacement: string[];
  if ("claim" in change) {
    replacement = ["Status: claimed", claimAnnotation({ ...change.claim, was: currentStatus })];
  } else if ("resolve" in change) {
    // Any claim annotation is dropped below, and the status it remembered is no longer wanted.
    replacement = ["Status: resolved"];
  } else {
    const was = currentStatus.toLowerCase() === "claimed" ? (existing?.was ?? "") : currentStatus;
    replacement = was === "" ? [] : [`Status: ${was}`];
  }

  // Without a `Status:` line the replacement goes after the last header field, or under the title.
  const insertAfter = statusIndex === -1 ? lastFieldIndex : -1;
  const out: string[] = [];
  lines.forEach((line, i) => {
    if (!annotationIndexes.has(i)) {
      if (i === statusIndex) out.push(...replacement);
      else out.push(line);
    }
    if (i === insertAfter && replacement.length > 0) {
      if (i === titleIndex) out.push("");
      out.push(...replacement);
    }
  });
  return out.join(eol);
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
  const body = [
    preamble.slice(bodyStart).join("\n"),
    ...bodySections.map((s) => `## ${s.heading}\n\n${s.content}`),
  ]
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

/** The file of a ticket, relative to the main checkout, with forward slashes. */
export async function ticketFile(mainCheckout: string, map: string, id: string): Promise<string | null> {
  const dir = join(".scratch", map, "issues");
  const files = await readdir(join(mainCheckout, dir)).catch(() => []);
  const file = files.find((name) => TICKET_FILE.exec(name)?.[1] === id);
  return file === undefined ? null : `${dir.replaceAll("\\", "/")}/${file}`;
}

/** Reads every `.scratch/<map>/issues/NN-*.md` under `mainCheckout`, ordered by map then number. */
export async function readLocalMarkdownTickets(
  mainCheckout: string,
  vocabulary: TriageVocabulary = defaultTriageVocabulary(),
): Promise<Ticket[]> {
  const scratch = join(mainCheckout, ".scratch");
  const maps = await readdir(scratch, { withFileTypes: true }).catch(() => []);
  const tickets: Ticket[] = [];
  for (const map of maps.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()) {
    const dir = join(scratch, map, "issues");
    const files = await readdir(dir).catch(() => []);
    for (const file of files) {
      const match = TICKET_FILE.exec(file);
      if (!match?.[1]) continue;
      tickets.push(parseTicketFile(map, match[1], await readFile(join(dir, file), "utf8"), vocabulary));
    }
  }
  return tickets.sort((a, b) => a.map.localeCompare(b.map) || Number(a.id) - Number(b.id));
}
