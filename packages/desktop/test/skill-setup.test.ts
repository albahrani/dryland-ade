import { describe, expect, it } from "vitest";
import { summarizeSkillSetup } from "../src/shared/skill-setup.ts";

const report = { deviations: [], extras: [], fingerprint: "f", deviationFingerprint: "d" };

describe("summarizeSkillSetup", () => {
  it("makes a banner of a repo that is not set up, pointing at /setup-matt-pocock-skills", () => {
    expect(summarizeSkillSetup({ ...report, state: "not-set-up" })).toMatchObject({
      tone: "banner",
      command: "/setup-matt-pocock-skills",
    });
  });

  it("lists every deviation of a modified setup", () => {
    const summary = summarizeSkillSetup({
      ...report,
      state: "modified",
      deviations: [
        { kind: "skill-differs", skill: "tdd", detail: "Skill tdd differs from the default." },
        { kind: "core-skill-missing", skill: "triage", detail: "Core skill triage is not installed." },
      ],
    });
    expect(summary).toMatchObject({ label: "Skill setup: modified", tone: "warning", command: null });
    expect(summary.lines).toEqual(["Skill tdd differs from the default.", "Core skill triage is not installed."]);
  });

  it("names the extras of a default setup with extras, and says nothing more of a default one", () => {
    expect(summarizeSkillSetup({ ...report, state: "default-with-extras", extras: ["mine", "yours"] }).lines).toEqual([
      "Additional skills: mine, yours",
    ]);
    expect(summarizeSkillSetup({ ...report, state: "default" })).toMatchObject({ tone: "info", lines: [] });
  });
});
