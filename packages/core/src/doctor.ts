import { readdir, readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { COPILOT_CLI } from "./agent-adapter.ts";
import {
  copilotHooksStatus,
  copilotPaths,
  type HookFileStatus,
  installCopilotHooks,
  readTrustedFolders,
  removeCopilotHooks,
  trustFolders,
  untrustFolders,
} from "./copilot-config.ts";
import { exists, findExecutable } from "./env-fs.ts";
import { DrylandError } from "./errors.ts";
import { findMainCheckout } from "./main-checkout.ts";
import type { ProcessRunner } from "./process-runner.ts";
import { isStoreInitialised } from "./state-store.ts";
import { listWorktrees } from "./worktree.ts";
import { TRIAGE_LABELS_DOC } from "./triage-labels.ts";

const SETUP_SKILL = "/setup-matt-pocock-skills";
/** The docs `setup` checks. */
const SETUP_DOCS = [TRIAGE_LABELS_DOC, "docs/agents/domain.md"];
const SKILL_DIRS = [".claude/skills", ".agents/skills"];

export interface DoctorCheck {
  id: "setup" | "store" | "path" | "hooks";
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
  /** The user's home, where agent CLIs keep their config; defaults to the real one. */
  home?: string;
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

async function checkStore(mainCheckout: string): Promise<DoctorCheck> {
  if (await isStoreInitialised(mainCheckout)) return pass("store", "The Dryland state store exists.");
  return fail("store", "This repo has no Dryland state store.", "Run `dryland init` to create one.");
}

async function checkPath(env: Record<string, string | undefined>): Promise<DoctorCheck> {
  const found = await findExecutable("dryland", env);
  if (found !== null) return pass("path", `dryland is on PATH (${dirname(found)}).`);
  return fail(
    "path",
    "dryland is not on PATH.",
    "Add the directory holding the dryland launcher to PATH (the installer has an opt-in for this).",
  );
}

/** The linked worktrees of the project that exist on disk: the folders Copilot would ask to trust. */
async function linkedWorktrees(runner: ProcessRunner, cwd: string | null): Promise<string[]> {
  if (cwd === null) return [];
  try {
    const entries = await listWorktrees(runner, await findMainCheckout(runner, cwd));
    const paths = entries.filter((entry) => !entry.main).map((entry) => entry.path);
    return (await Promise.all(paths.map(async (path) => ((await exists(path)) ? path : null)))).filter(
      (path): path is string => path !== null,
    );
  } catch (error) {
    if (!(error instanceof DrylandError)) throw error;
    return [];
  }
}

const INSTALL_HOOKS = "Run `dryland doctor --install-hooks`.";

async function checkHooks(
  runner: ProcessRunner,
  cwd: string,
  env: Record<string, string | undefined>,
  home: string,
): Promise<DoctorCheck> {
  const name = COPILOT_CLI.name;
  if ((await findExecutable(COPILOT_CLI.binary, env)) === null) {
    return pass("hooks", `${name} is not installed, so there are no hooks to check.`);
  }
  const { status, hookFile, worktrees, trusted } = await readAgentHooks(runner, cwd, { env, home });
  if (status !== "installed") {
    const detail = status === "missing" ? "has no Dryland hook file" : "has an outdated Dryland hook file";
    return fail("hooks", `${name} ${detail} (${hookFile}).`, INSTALL_HOOKS);
  }
  return pass(
    "hooks",
    `${name} hook file is installed; ${trusted.length} of ${worktrees.length} worktrees are trusted.`,
  );
}

/** The spelling of a worktree path that is listed in `trustedFolders`: its real path. */
const trustedPath = (path: string) => realpath(path).catch(() => path);

/** What Dryland keeps in the user's Copilot config, as `installAgentHooks` and the app wrote it. */
export interface AgentHooks {
  /** Dryland's hook file and whether it is there and current. */
  hookFile: string;
  status: HookFileStatus;
  /** The hook file's text, exactly as on disk; `null` when it is missing. */
  hookFileText: string | null;
  /** Copilot's config, whose `trustedFolders` holds the trust entries. */
  config: string;
  /** The project's linked worktrees that exist, and those of them listed in `trustedFolders` (real paths). */
  worktrees: string[];
  trusted: string[];
}

/** Reads the hook file and trust entries of the project at `cwd` (`null` for none: no worktrees to look at). */
export async function readAgentHooks(
  runner: ProcessRunner,
  cwd: string | null,
  options: DoctorOptions = {},
): Promise<AgentHooks> {
  const paths = copilotPaths(options.env ?? process.env, options.home);
  const status = await copilotHooksStatus(paths, COPILOT_CLI);
  const hookFileText = await readFile(paths.hookFile, "utf8").catch(() => null);
  const worktrees = await linkedWorktrees(runner, cwd);
  const listed = new Set(await readTrustedFolders(paths));
  const real = await Promise.all(worktrees.map(trustedPath));
  return {
    hookFile: paths.hookFile,
    status,
    hookFileText,
    config: paths.config,
    worktrees,
    trusted: real.filter((path) => listed.has(path)),
  };
}

export interface HooksResult {
  /** What was done, one line each. */
  lines: string[];
  warnings: string[];
}

/**
 * Installs the hook file of every Agent CLI that has no per-launch hook injection, and trusts the project's linked
 * worktrees so the CLI asks no trust question there. Writes only what Dryland owns: its hook file and the trust entries.
 */
export async function installAgentHooks(
  runner: ProcessRunner,
  cwd: string | null,
  options: DoctorOptions = {},
): Promise<HooksResult> {
  const paths = copilotPaths(options.env ?? process.env, options.home);
  const lines: string[] = [];
  const warnings: string[] = [];
  const installed = await installCopilotHooks(paths, COPILOT_CLI);
  lines.push(installed ? `Installed ${paths.hookFile}.` : `${paths.hookFile} is already installed.`);
  const worktrees = await linkedWorktrees(runner, cwd);
  if (worktrees.length > 0) {
    const result = await trustFolders(paths, worktrees);
    if (result.warning !== undefined) warnings.push(result.warning);
    else if (result.status === "skipped")
      warnings.push(`${paths.config} does not exist yet, so no worktree was trusted.`);
    else lines.push(`Trusted ${worktrees.length} worktree${worktrees.length === 1 ? "" : "s"} in ${paths.config}.`);
  }
  return { lines, warnings };
}

/** Removes what `installAgentHooks` and the app wrote: the hook file and the trust entries of the project's worktrees. */
export async function removeAgentHooks(
  runner: ProcessRunner,
  cwd: string | null,
  options: DoctorOptions = {},
): Promise<HooksResult> {
  const paths = copilotPaths(options.env ?? process.env, options.home);
  const lines: string[] = [];
  const warnings: string[] = [];
  lines.push((await removeCopilotHooks(paths)) ? `Removed ${paths.hookFile}.` : `${paths.hookFile} was not installed.`);
  const worktrees = await linkedWorktrees(runner, cwd);
  if (worktrees.length > 0) {
    const result = await untrustFolders(paths, worktrees);
    if (result.warning !== undefined) warnings.push(result.warning);
    else if (result.status === "changed")
      lines.push(`Removed the project's worktrees from trustedFolders in ${paths.config}.`);
  }
  return { lines, warnings };
}

/** Checks what the user can fix themselves: setup, the state store, `PATH` and agent hooks. Never throws for a failing check. */
export async function runDoctor(
  runner: ProcessRunner,
  cwd: string,
  options: DoctorOptions = {},
): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];
  const env = options.env ?? process.env;
  try {
    const mainCheckout = await findMainCheckout(runner, cwd);
    checks.push(await checkSetup(mainCheckout), await checkStore(mainCheckout));
  } catch (error) {
    if (!(error instanceof DrylandError)) throw error;
    checks.push(fail("setup", error.message, error.nextAction), fail("store", error.message, error.nextAction));
  }
  checks.push(await checkPath(env), await checkHooks(runner, cwd, env, options.home ?? homedir()));
  return { ok: checks.every((check) => check.ok), checks };
}
