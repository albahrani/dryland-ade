import { readdir, stat } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { envKey, exists } from "./env-fs.ts";
import { DrylandError } from "./errors.ts";
import { findMainCheckout } from "./main-checkout.ts";
import type { ProcessRunner } from "./process-runner.ts";
import { readTrackerKind, type TrackerKind } from "./tracker.ts";
import { TRIAGE_LABELS_DOC } from "./triage-labels.ts";

const SETUP_SKILL = "/setup-matt-pocock-skills";
/** The docs `setup` checks; the tracker doc is the tracker check's, so a missing one is reported once. */
const SETUP_DOCS = [TRIAGE_LABELS_DOC, "docs/agents/domain.md"];
const SKILL_DIRS = [".claude/skills", ".agents/skills"];

export interface DoctorCheck {
  id: "setup" | "tracker" | "path";
  ok: boolean;
  detail: string;
  /** What to do about a failing check; `null` when it passed. */
  nextAction: string | null;
}

export interface DoctorReport {
  /** Every check passed. */
  ok: boolean;
  checks: DoctorCheck[];
}

export interface DoctorOptions {
  /** The environment whose `PATH` is searched; defaults to `process.env`. */
  env?: Record<string, string | undefined>;
}

const pass = (id: DoctorCheck["id"], detail: string): DoctorCheck => ({
  id,
  ok: true,
  detail,
  nextAction: null,
});
const fail = (id: DoctorCheck["id"], detail: string, nextAction: string): DoctorCheck => ({
  id,
  ok: false,
  detail,
  nextAction,
});

async function hasSkills(mainCheckout: string): Promise<boolean> {
  for (const dir of SKILL_DIRS) {
    const names = await readdir(join(mainCheckout, dir)).catch(() => []);
    for (const name of names) if (await exists(join(mainCheckout, dir, name, "SKILL.md"))) return true;
  }
  return false;
}

async function checkSetup(mainCheckout: string): Promise<DoctorCheck> {
  const missing: string[] = [];
  if (!(await hasSkills(mainCheckout))) missing.push(`skills (${SKILL_DIRS.join(" or ")})`);
  for (const doc of SETUP_DOCS) if (!(await exists(join(mainCheckout, doc)))) missing.push(doc);
  if (missing.length > 0) {
    return fail("setup", `Missing: ${missing.join(", ")}.`, `Run ${SETUP_SKILL} in this repo.`);
  }
  return pass("setup", "Skills and docs/agents files are present.");
}

const FORGE_CLI: Record<Exclude<TrackerKind, "local-markdown">, { cli: string; name: string; url: string }> = {
  github: { cli: "gh", name: "GitHub", url: "https://cli.github.com" },
  gitlab: {
    cli: "glab",
    name: "GitLab",
    url: "https://gitlab.com/gitlab-org/cli",
  },
};

async function checkTracker(runner: ProcessRunner, mainCheckout: string): Promise<DoctorCheck> {
  let kind: TrackerKind;
  try {
    kind = await readTrackerKind(mainCheckout);
  } catch (error) {
    if (!(error instanceof DrylandError)) throw error;
    return fail("tracker", error.message, error.nextAction);
  }
  if (kind === "local-markdown") return pass("tracker", "Local Markdown: the Dryland tracker.");

  const { cli, name, url } = FORGE_CLI[kind];
  if ((await runner.run(cli, ["--version"], { cwd: mainCheckout })).exitCode !== 0) {
    return fail(
      "tracker",
      `${name} tracker, but \`${cli}\` is not installed.`,
      `Install ${cli} from ${url}, then run \`${cli} auth login\`.`,
    );
  }
  if ((await runner.run(cli, ["auth", "status"], { cwd: mainCheckout })).exitCode !== 0) {
    return fail("tracker", `${name} tracker, but \`${cli}\` is not logged in.`, `Run \`${cli} auth login\`.`);
  }
  return pass("tracker", `${name}: \`${cli}\` is installed and logged in.`);
}

async function isRunnable(path: string, windows: boolean): Promise<boolean> {
  const info = await stat(path).catch(() => null);
  if (info === null || !info.isFile()) return false;
  return windows || (info.mode & 0o111) !== 0;
}

async function checkPath(env: Record<string, string | undefined>): Promise<DoctorCheck> {
  const dirs = (env[envKey(env, "PATH")] ?? "").split(delimiter).filter((dir) => dir !== "");
  // On Windows a command needs one of the PATHEXT extensions to run; elsewhere it needs the x bit.
  const windows = process.platform === "win32";
  const extensions = windows
    ? (env[envKey(env, "PATHEXT")] ?? ".COM;.EXE;.BAT;.CMD").split(";").filter((ext) => ext !== "")
    : [""];
  for (const dir of dirs) {
    for (const extension of extensions) {
      if (await isRunnable(join(dir, `dryland${extension}`), windows))
        return pass("path", `dryland is on PATH (${dir}).`);
    }
  }
  return fail(
    "path",
    "dryland is not on PATH.",
    "Add the directory holding the dryland launcher to PATH (the installer has an opt-in for this).",
  );
}

/** Checks what the user can fix themselves: setup, tracker and `PATH`. Never throws for a failing check. */
export async function runDoctor(
  runner: ProcessRunner,
  cwd: string,
  options: DoctorOptions = {},
): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];
  try {
    const mainCheckout = await findMainCheckout(runner, cwd);
    checks.push(await checkSetup(mainCheckout), await checkTracker(runner, mainCheckout));
  } catch (error) {
    if (!(error instanceof DrylandError)) throw error;
    checks.push(fail("setup", error.message, error.nextAction), fail("tracker", error.message, error.nextAction));
  }
  checks.push(await checkPath(options.env ?? process.env));
  return { ok: checks.every((check) => check.ok), checks };
}
