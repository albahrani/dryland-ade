import { describe, expect, it } from "vitest";
import type { Compatibility } from "@dryland/core";
import { featureRows, summarizeSkillSetup } from "../src/shared/skill-setup.ts";

const verdict = (features: Compatibility["features"], all: Record<string, "ok" | "degraded" | "broken">) =>
  ({
    needsDialog: false,
    accepted: false,
    note: null,
    verdict: {
      fingerprint: "f",
      features: Object.fromEntries(
        Object.entries(all).map(([id, v]) => [id, { verdict: v, reason: v === "ok" ? null : `${id} reason` }]),
      ),
    },
    features,
  }) satisfies Compatibility;

describe("featureRows", () => {
  it("lists every judged feature, ok ones too, with the state of each broken one's override", () => {
    const rows = featureRows(
      verdict(
        [
          { id: "retro", verdict: "broken", reason: "retro reason", disabled: true, overridden: false },
          { id: "open-pr", verdict: "broken", reason: "open-pr reason", disabled: false, overridden: true },
          {
            id: "review-before-pr",
            verdict: "degraded",
            reason: "review-before-pr reason",
            disabled: false,
            overridden: false,
          },
        ],
        { "map-frontier": "ok", retro: "broken", "open-pr": "broken", "review-before-pr": "degraded" },
      ),
    );
    expect(rows).toEqual([
      { id: "map-frontier", verdict: "ok", reason: null, disabled: false, overridden: false },
      { id: "retro", verdict: "broken", reason: "retro reason", disabled: true, overridden: false },
      { id: "open-pr", verdict: "broken", reason: "open-pr reason", disabled: false, overridden: true },
      {
        id: "review-before-pr",
        verdict: "degraded",
        reason: "review-before-pr reason",
        disabled: false,
        overridden: false,
      },
    ]);
  });

  it("is empty without a valid verdict", () => {
    expect(featureRows({ needsDialog: true, accepted: false, verdict: null, note: null, features: [] })).toEqual([]);
  });
});

const report = { deviations: [], extras: [], installed: [], fingerprint: "f", deviationFingerprint: "d" };

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
