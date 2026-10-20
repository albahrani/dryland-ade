import type { Compatibility, SkillSetupReport } from "@dryland/core";

/** One feature the Compatibility verdict judged, with what the user did about it. */
export interface FeatureRow {
  id: string;
  verdict: "ok" | "degraded" | "broken";
  reason: string | null;
  /** Broken and not overridden: the rule produces no next steps. */
  disabled: boolean;
  /** Broken, but the user turned it back on. */
  overridden: boolean;
}

/** Every feature of the valid verdict, in its order, ok ones included; none without a valid verdict. */
export function featureRows(compatibility: Compatibility): FeatureRow[] {
  const flagged = new Map(compatibility.features.map((feature) => [feature.id, feature]));
  return Object.entries(compatibility.verdict?.features ?? {}).map(([id, finding]) => ({
    id,
    verdict: finding.verdict,
    reason: finding.reason,
    disabled: flagged.get(id)?.disabled ?? false,
    overridden: flagged.get(id)?.overridden ?? false,
  }));
}

/** What the app says about a project's Skill setup state. */
export interface SkillSetupSummary {
  /** The state in words, as the panel's title. */
  label: string;
  /** `banner` asks the user to act, `warning` flags deviations, `info` is for a setup that is fine. */
  tone: "banner" | "warning" | "info";
  /** The deviations, one line each; extras are listed for default with extras. */
  lines: string[];
  /** The skill command to run for a repo that is not set up. */
  command: string | null;
}

/** Words for the panel that shows `report`: its title, how loudly to show it, and one line per deviation or extra. */
export function summarizeSkillSetup(report: SkillSetupReport): SkillSetupSummary {
  switch (report.state) {
    case "not-set-up":
      return {
        label: "Skills are not set up in this repo",
        tone: "banner",
        lines: report.deviations.map((deviation) => deviation.detail),
        command: "/setup-matt-pocock-skills",
      };
    case "default":
      return { label: "Skill setup: default", tone: "info", lines: [], command: null };
    case "default-with-extras":
      return {
        label: "Skill setup: default with extras",
        tone: "info",
        lines: [`Additional skills: ${report.extras.join(", ")}`],
        command: null,
      };
    case "modified":
      return {
        label: "Skill setup: modified",
        tone: "warning",
        lines: report.deviations.map((deviation) => deviation.detail),
        command: null,
      };
  }
}
