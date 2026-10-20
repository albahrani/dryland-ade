import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { RULE_IDS, type FeatureVerdict, type SkillSetupSnapshot } from "./next-step.ts";
import type { SkillSetupReport } from "./skill-setup.ts";

/** Where the agent writes the Compatibility verdict, relative to the main checkout. */
export const COMPAT_VERDICT_FILE = ".dryland/compat.md";

/** What the "Run check" session has typed for it: the agent reads the prompt from Dryland and follows it. */
export const COMPAT_RUN_COMMAND = "Run `dryland doctor --compat-prompt` and follow the instructions it prints.";

const VERDICTS: readonly FeatureVerdict[] = ["ok", "degraded", "broken"];

/** The user's decisions about a modified setup, stored per project by the app. */
export interface CompatConfig {
  /** The deviation fingerprint the user accepted; `null` when they accepted none. */
  acceptedDeviations: string | null;
  /** Rule ids the user re-enabled although the verdict calls them broken. */
  overrides: string[];
}

export const NO_COMPAT_CONFIG: CompatConfig = { acceptedDeviations: null, overrides: [] };

/** What the verdict says about one feature (a rule). */
export interface FeatureFinding {
  verdict: FeatureVerdict;
  reason: string | null;
}

/** A parsed Compatibility verdict, tied to the setup fingerprint it was written for. */
export interface Verdict {
  fingerprint: string;
  features: Record<string, FeatureFinding>;
}

/**
 * Parses a verdict file: a header block between `---` lines holding `dryland-compat: 1` and `fingerprint: <hex>`,
 * then one `- <rule id>: ok|degraded|broken` line per feature, a reason after ` - ` for degraded and broken ones.
 * Returns the problem as a string when the file is malformed.
 */
export function parseVerdict(text: string): Verdict | string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines[0]?.trim() !== "---") return "it has no header block";
  const end = lines.indexOf("---", 1);
  if (end === -1) return "its header block is not closed";
  const header = new Map(
    lines.slice(1, end).map((line) => {
      const colon = line.indexOf(":");
      if (colon === -1) return [line.trim(), ""] as const;
      return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()] as const;
    }),
  );
  if (header.get("dryland-compat") !== "1") return "its format version is not 1";
  const fingerprint = header.get("fingerprint");
  if (fingerprint === undefined || !/^[0-9a-f]{64}$/.test(fingerprint)) return "its fingerprint is missing or invalid";

  const features: Record<string, FeatureFinding> = {};
  for (const line of lines.slice(end + 1)) {
    if (line.trim() === "") continue;
    const match = /^[-*]\s+([a-z-]+):\s*(ok|degraded|broken)\s*(?:[-—–]\s*(.*))?$/.exec(line.trim());
    if (match === null) return `the line "${line.trim()}" is not a feature verdict`;
    const [, id, verdict, reason] = match;
    if (!(RULE_IDS as readonly string[]).includes(id as string)) return `"${id}" is not a Dryland feature`;
    features[id as string] = { verdict: verdict as FeatureVerdict, reason: reason?.trim() || null };
  }
  if (Object.keys(features).length === 0) return "it judges no feature";
  return { fingerprint, features };
}

/** The verdict file of `mainCheckout`: nothing when there is none, a note when it cannot be used. */
export type VerdictRead = { kind: "none" } | { kind: "malformed"; note: string } | { kind: "found"; verdict: Verdict };

export async function readVerdictFile(mainCheckout: string): Promise<VerdictRead> {
  let text: string;
  try {
    text = await readFile(join(mainCheckout, COMPAT_VERDICT_FILE), "utf8");
  } catch {
    return { kind: "none" };
  }
  const parsed = parseVerdict(text);
  if (typeof parsed === "string") {
    return { kind: "malformed", note: `${COMPAT_VERDICT_FILE} is ignored: ${parsed}.` };
  }
  return { kind: "found", verdict: parsed };
}

/** A feature the verdict does not call fine, as the app shows it. */
export interface FeatureStatus {
  id: string;
  verdict: "degraded" | "broken";
  reason: string | null;
  /** Broken and not overridden: the rule produces no next steps. */
  disabled: boolean;
  /** Broken, but the user turned it back on. */
  overridden: boolean;
}

/** How the Compatibility check stands for a project. */
export interface Compatibility {
  /** Whether the app asks what to do about the deviations: modified, no valid verdict, nothing accepted. */
  needsDialog: boolean;
  /** The valid verdict for the current setup, or `null`. */
  verdict: Verdict | null;
  /** Why a verdict file is not used (malformed), shown to the user; `null` otherwise. */
  note: string | null;
  /** The degraded and broken features of the valid verdict. */
  features: FeatureStatus[];
}

/**
 * Combines the setup `report`, the verdict file `read` and the user's `config`. A verdict counts only for a
 * modified setup and only while its fingerprint is the setup's; an older one is ignored, as if absent.
 */
export function judgeCompatibility(report: SkillSetupReport, read: VerdictRead, config: CompatConfig): Compatibility {
  if (report.state !== "modified") return { needsDialog: false, verdict: null, note: null, features: [] };
  const verdict = read.kind === "found" && read.verdict.fingerprint === report.fingerprint ? read.verdict : null;
  const accepted = config.acceptedDeviations === report.deviationFingerprint;
  const features = Object.entries(verdict?.features ?? {}).flatMap(([id, finding]): FeatureStatus[] => {
    if (finding.verdict === "ok") return [];
    const overridden = finding.verdict === "broken" && config.overrides.includes(id);
    return [
      {
        id,
        verdict: finding.verdict,
        reason: finding.reason,
        disabled: finding.verdict === "broken" && !overridden,
        overridden,
      },
    ];
  });
  return {
    needsDialog: verdict === null && !accepted,
    verdict,
    note: read.kind === "malformed" ? read.note : null,
    features,
  };
}

/** Reads the verdict file of `mainCheckout` and judges it against `report`. */
export async function readCompatibility(
  mainCheckout: string,
  report: SkillSetupReport,
  config: CompatConfig = NO_COMPAT_CONFIG,
): Promise<Compatibility> {
  return judgeCompatibility(report, await readVerdictFile(mainCheckout), config);
}

/** The setup as the rules read it: the verdict per rule, the user's overrides and the skills installed. */
export function skillSetupSnapshot(
  report: SkillSetupReport,
  compatibility: Compatibility,
  config: CompatConfig = NO_COMPAT_CONFIG,
): SkillSetupSnapshot | null {
  if (report.state === "not-set-up") return null;
  return {
    setup: report.state,
    verdict:
      compatibility.verdict === null
        ? null
        : Object.fromEntries(Object.entries(compatibility.verdict.features).map(([id, f]) => [id, f.verdict])),
    overrides: config.overrides,
    installed: report.installed,
  };
}

const RULE_DESCRIPTIONS: Record<(typeof RULE_IDS)[number], string> = {
  "no-setup-config": "recommends /setup-matt-pocock-skills when docs/agents/issue-tracker.md is missing",
  "waiting-session": "flags a session that waits for input",
  "paused-was-waiting": "flags a paused session that was waiting for input",
  "stale-claim": "flags a claimed ticket no session or worktree holds",
  "map-frontier": "recommends /wayfinder <map> for an open, unblocked, unclaimed decision ticket",
  "implement-spec": "recommends /implement-spec for a spec with ready-for-agent tickets",
  "implement-ticket": "recommends /implement <map>/<NN> for a ready-for-agent, unblocked, unclaimed ticket",
  "map-fog-only": "recommends /wayfinder <map> for a map with fog and no open ticket",
  "map-cleared": "recommends /to-spec <map> for a cleared map without a spec",
  "needs-triage": "recommends /triage for a ticket with the needs-triage role",
  "spec-without-tickets": "recommends /to-tickets for a spec not yet sliced",
  "blocking-unknown": "flags a ticket whose blockers the tracker cannot report",
  "review-before-pr": "recommends /code-review for resolved work ahead of the default branch",
  "open-pr": "recommends /pr for resolved work ahead of the default branch with no PR",
  retro: "recommends /retro for resolved work whose branch is merged",
};

/**
 * The compatibility prompt `dryland doctor --compat-prompt` prints: what the agent checks, and the exact format of the
 * verdict file it writes. `report` supplies the deviations to look at and the fingerprint the verdict is tied to.
 */
export function compatPrompt(report: SkillSetupReport): string {
  const deviations =
    report.deviations.length === 0
      ? "(none found by Dryland; check the skills and docs/agents anyway)"
      : report.deviations.map((deviation) => `- ${deviation.detail}`).join("\n");
  const features = RULE_IDS.map((id) => `- \`${id}\`: ${RULE_DESCRIPTIONS[id]}`).join("\n");
  return `# Dryland compatibility check

Dryland recommends skills from artifacts in this repo. This repo's skill setup differs from the default Dryland
ships. Decide, for each Dryland feature, whether it still works with the skills and docs/agents files installed here.
Read the skills under .claude/skills and .agents/skills and the files under docs/agents. Do not change any of them.

Deviations Dryland found:
${deviations}

Features to judge (each is a rule that recommends a skill or raises a flag):
${features}

For each feature decide:
- ok: the skill exists and does what the rule expects.
- degraded: it works, but not fully. Give the reason.
- broken: the skill is missing or no longer does what the rule expects. Give the reason.

Write the verdict to ${COMPAT_VERDICT_FILE} in the main checkout (the first entry of \`git worktree list\`; create the .dryland directory if needed), in exactly
this format, one line per feature above:

\`\`\`
---
dryland-compat: 1
fingerprint: ${report.fingerprint}
---

- map-frontier: ok
- implement-ticket: degraded - /implement does not read the ticket's Spec header
- retro: broken - the retro skill is not installed
\`\`\`

Keep the fingerprint line as given: it ties the verdict to this setup, and Dryland ignores the verdict once the setup
changes. Write nothing else.
`;
}
