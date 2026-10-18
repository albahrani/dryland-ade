import type { SkillSetupReport } from "@dryland/core";

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

export function summarizeSkillSetup(report: SkillSetupReport): SkillSetupSummary {
  switch (report.state) {
    case "not-set-up":
      return {
        label: "Skills are not set up in this repo",
        tone: "banner",
        lines: ["No skills and no docs/agents/issue-tracker.md found."],
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
