import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { exists } from "./env-fs.ts";
import { DrylandError } from "./errors.ts";
import { DEFAULT_SKILL_MIRROR } from "./skill-mirror.ts";
import { readTrackerKind, TRACKER_DOC } from "./tracker.ts";

/** Where the skills of a repo live, relative to its main checkout. */
export const SKILL_ROOTS = [".claude/skills", ".agents/skills"] as const;

/** The default setup Dryland ships: a fingerprint per upstream skill, and the skills Dryland cannot work without. */
export interface SkillMirror {
  /** The skill's name to the fingerprint of its directory, see {@link fingerprintSkill}. */
  skills: Readonly<Record<string, string>>;
  /** Skills whose absence makes the setup modified. */
  core: readonly string[];
}

/** One way the repo's setup departs from the default, as one line the app can show. */
export type SkillDeviation =
  | { kind: "skill-differs"; skill: string; detail: string }
  | { kind: "core-skill-missing"; skill: string; detail: string }
  | { kind: "no-skills"; detail: string }
  | { kind: "tracker"; detail: string };

/**
 * - `not-set-up`: no skills, or no tracker doc; `/setup-matt-pocock-skills` has not run.
 * - `default`: every installed skill is a known one, unchanged.
 * - `default-with-extras`: as `default`, plus skills the mirror does not know.
 * - `modified`: a known skill differs, a core skill is missing, or the tracker is not one Dryland reads.
 */
export type SkillSetupState = "not-set-up" | "default" | "default-with-extras" | "modified";

export interface SkillSetupReport {
  state: SkillSetupState;
  deviations: SkillDeviation[];
  /** Installed skills the mirror does not know, sorted. */
  extras: string[];
  /** Stable for the same setup, different once a skill or a `docs/agents` file changes. */
  fingerprint: string;
}

const sha256 = (content: string | Buffer): string => createHash("sha256").update(content).digest("hex");

/** Markdown files under `dir`, relative and `/`-separated, sorted, without the `agents/` metadata an installer adds. */
async function markdownFiles(dir: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(join(dir, prefix), { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      if (relative !== "agents") files.push(...(await markdownFiles(dir, relative)));
    } else if (entry.name.endsWith(".md")) files.push(relative);
  }
  return files.sort();
}

/**
 * The fingerprint of the skill directory `dir`: a hash over its Markdown files and their names. Line endings do
 * not count, so a Windows checkout with `autocrlf` matches the mirror.
 */
export async function fingerprintSkill(dir: string): Promise<string> {
  const hash = createHash("sha256");
  for (const file of await markdownFiles(dir)) hash.update(`${file}\0${await lineEndingFreeHash(join(dir, file))}\n`);
  return hash.digest("hex");
}

/** The hash of the file at `path`, whatever its line endings. */
async function lineEndingFreeHash(path: string): Promise<string> {
  return sha256((await readFile(path, "utf8")).replace(/\r\n/g, "\n"));
}

/** The installed skills by name, each with the directory it was found in (`.claude/skills` before `.agents/skills`). */
async function installedSkillDirs(mainCheckout: string): Promise<Map<string, string[]>> {
  const found = new Map<string, string[]>();
  for (const root of SKILL_ROOTS) {
    // Not `isDirectory()` on the entry: an installer links `.claude/skills/<name>` to `.agents/skills/<name>`.
    const names = await readdir(join(mainCheckout, root)).catch(() => []);
    for (const name of names.sort()) {
      const dir = join(mainCheckout, root, name);
      if (!(await exists(join(dir, "SKILL.md")))) continue;
      found.set(name, [...(found.get(name) ?? []), dir]);
    }
  }
  return found;
}

/** One `path:hash` line per `docs/agents` file, so that editing one changes the fingerprint. */
async function docHashes(mainCheckout: string): Promise<string[]> {
  const dir = join(mainCheckout, "docs", "agents");
  const lines: string[] = [];
  for (const file of await markdownFiles(dir)) {
    lines.push(`docs/agents/${file}:${await lineEndingFreeHash(join(dir, file))}`);
  }
  return lines;
}

async function trackerDeviation(mainCheckout: string): Promise<SkillDeviation | null> {
  try {
    await readTrackerKind(mainCheckout);
    return null;
  } catch (error) {
    if (!(error instanceof DrylandError)) throw error;
    return { kind: "tracker", detail: `${error.message} It is not the tracker Dryland reads.` };
  }
}

/**
 * Compares the skills installed in `mainCheckout` and its `docs/agents` files with the default `mirror`. Only reads:
 * nothing here, or anywhere else in Dryland, writes a skill directory or a `docs/agents` file.
 */
export async function readSkillSetup(
  mainCheckout: string,
  mirror: SkillMirror = DEFAULT_SKILL_MIRROR,
): Promise<SkillSetupReport> {
  const installed = await installedSkillDirs(mainCheckout);
  const trackerPresent = await exists(join(mainCheckout, TRACKER_DOC));
  const deviations: SkillDeviation[] = [];
  const extras: string[] = [];
  const fingerprint = createHash("sha256");

  for (const [name, dirs] of [...installed].sort(([a], [b]) => a.localeCompare(b))) {
    const prints = await Promise.all(dirs.map(fingerprintSkill));
    fingerprint.update(`skill:${name}:${prints.join(",")}\n`);
    const known = mirror.skills[name];
    if (known === undefined) extras.push(name);
    else if (prints.some((print) => print !== known)) {
      deviations.push({ kind: "skill-differs", skill: name, detail: `Skill ${name} differs from the default.` });
    }
  }
  for (const line of await docHashes(mainCheckout)) fingerprint.update(`${line}\n`);

  // `/setup-matt-pocock-skills` writes both the skills and the tracker doc, so a repo missing either is not set up.
  const notSetUp = installed.size === 0 || !trackerPresent;
  if (installed.size === 0) deviations.push({ kind: "no-skills", detail: "No skills are installed." });
  else {
    for (const skill of mirror.core) {
      if (!installed.has(skill)) {
        deviations.push({ kind: "core-skill-missing", skill, detail: `Core skill ${skill} is not installed.` });
      }
    }
  }
  const tracker = await trackerDeviation(mainCheckout);
  if (tracker !== null) deviations.push(tracker);

  const state: SkillSetupState = notSetUp
    ? "not-set-up"
    : deviations.length > 0
      ? "modified"
      : extras.length > 0
        ? "default-with-extras"
        : "default";
  return { state, deviations, extras, fingerprint: fingerprint.digest("hex") };
}
