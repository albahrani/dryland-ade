import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SKILL_MIRROR, fingerprintSkill, readSkillSetup, type SkillMirror } from "../src/index.ts";

const LOCAL_TRACKER = "# Issue tracker: Local Markdown\n";

function write(root: string, files: Record<string, string>): void {
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  }
}

const tdd = { ".agents/skills/tdd/SKILL.md": "# tdd\n" };
const triage = { ".agents/skills/triage/SKILL.md": "# triage\n" };

/** A repo holding `files`, and the mirror of the default setup: tdd and triage, triage being core. */
async function setup(files: Record<string, string>) {
  const defaults = mkdtempSync(join(tmpdir(), "dryland-mirror-"));
  write(defaults, { ...tdd, ...triage });
  const mirror: SkillMirror = {
    skills: {
      tdd: await fingerprintSkill(join(defaults, ".agents/skills/tdd")),
      triage: await fingerprintSkill(join(defaults, ".agents/skills/triage")),
    },
    core: ["triage"],
  };
  const root = mkdtempSync(join(tmpdir(), "dryland-skill-setup-"));
  write(root, files);
  return { root, mirror };
}

describe("readSkillSetup", () => {
  it("calls the default skills and tracker the default setup", async () => {
    const { root, mirror } = await setup({ ...tdd, ...triage, "docs/agents/issue-tracker.md": LOCAL_TRACKER });
    expect(await readSkillSetup(root, mirror)).toMatchObject({ state: "default", deviations: [], extras: [] });
  });

  it("finds skills under .claude/skills as well as .agents/skills", async () => {
    const { root, mirror } = await setup({
      ".claude/skills/tdd/SKILL.md": "# tdd\n",
      ".claude/skills/triage/SKILL.md": "# triage\n",
      "docs/agents/issue-tracker.md": LOCAL_TRACKER,
    });
    expect((await readSkillSetup(root, mirror)).state).toBe("default");
  });

  it("ignores line endings when comparing a skill", async () => {
    const { root, mirror } = await setup({
      ".agents/skills/tdd/SKILL.md": "# tdd\r\n",
      ...triage,
      "docs/agents/issue-tracker.md": LOCAL_TRACKER,
    });
    expect((await readSkillSetup(root, mirror)).state).toBe("default");
  });

  it("calls additional skills default with extras", async () => {
    const { root, mirror } = await setup({
      ...tdd,
      ...triage,
      ".agents/skills/mine/SKILL.md": "# mine\n",
      "docs/agents/issue-tracker.md": LOCAL_TRACKER,
    });
    expect(await readSkillSetup(root, mirror)).toMatchObject({
      state: "default-with-extras",
      deviations: [],
      extras: ["mine"],
    });
  });

  it("calls a known skill that differs modified, and names it", async () => {
    const { root, mirror } = await setup({
      ".agents/skills/tdd/SKILL.md": "# tdd, my way\n",
      ...triage,
      "docs/agents/issue-tracker.md": LOCAL_TRACKER,
    });
    const report = await readSkillSetup(root, mirror);
    expect(report.state).toBe("modified");
    expect(report.deviations).toEqual([expect.objectContaining({ kind: "skill-differs", skill: "tdd" })]);
  });

  it("notices a change to a Markdown file beside SKILL.md", async () => {
    const { root, mirror } = await setup({
      ...tdd,
      ...triage,
      ".agents/skills/tdd/EXTRA.md": "added\n",
      "docs/agents/issue-tracker.md": LOCAL_TRACKER,
    });
    expect((await readSkillSetup(root, mirror)).deviations).toEqual([
      expect.objectContaining({ kind: "skill-differs", skill: "tdd" }),
    ]);
  });

  it("calls a missing core skill modified, and names it", async () => {
    const { root, mirror } = await setup({ ...tdd, "docs/agents/issue-tracker.md": LOCAL_TRACKER });
    const report = await readSkillSetup(root, mirror);
    expect(report.state).toBe("modified");
    expect(report.deviations).toEqual([expect.objectContaining({ kind: "core-skill-missing", skill: "triage" })]);
  });

  it("does not mind a missing skill that is not core", async () => {
    const { root, mirror } = await setup({ ...triage, "docs/agents/issue-tracker.md": LOCAL_TRACKER });
    expect((await readSkillSetup(root, mirror)).state).toBe("default");
  });

  it("calls a tracker Dryland does not read modified", async () => {
    const { root, mirror } = await setup({
      ...tdd,
      ...triage,
      "docs/agents/issue-tracker.md": "# Issue tracker: Jira\n",
    });
    const report = await readSkillSetup(root, mirror);
    expect(report.state).toBe("modified");
    expect(report.deviations).toEqual([expect.objectContaining({ kind: "tracker" })]);
  });

  it("calls a repo with skills but no tracker doc not set up", async () => {
    const { root, mirror } = await setup({ ...tdd, ...triage });
    const report = await readSkillSetup(root, mirror);
    expect(report.state).toBe("not-set-up");
    expect(report.deviations).toEqual([expect.objectContaining({ kind: "tracker" })]);
  });

  it("calls a repo with a tracker doc but no skills not set up", async () => {
    const { root, mirror } = await setup({ "docs/agents/issue-tracker.md": LOCAL_TRACKER });
    const report = await readSkillSetup(root, mirror);
    expect(report.state).toBe("not-set-up");
    expect(report.deviations).toEqual([expect.objectContaining({ kind: "no-skills" })]);
  });

  it("calls a repo with neither skills nor a tracker doc not set up", async () => {
    const { root, mirror } = await setup({ "README.md": "hi\n" });
    expect(await readSkillSetup(root, mirror)).toMatchObject({ state: "not-set-up" });
  });

  it("gives the same fingerprint for the same setup and another once a skill or doc changes", async () => {
    const files = { ...tdd, ...triage, "docs/agents/issue-tracker.md": LOCAL_TRACKER };
    const { root, mirror } = await setup(files);
    const before = (await readSkillSetup(root, mirror)).fingerprint;
    expect((await readSkillSetup(root, mirror)).fingerprint).toBe(before);

    const sameFiles = await setup(files);
    expect((await readSkillSetup(sameFiles.root, mirror)).fingerprint).toBe(before);

    write(root, { ".agents/skills/mine/SKILL.md": "# mine\n" });
    const withExtra = (await readSkillSetup(root, mirror)).fingerprint;
    expect(withExtra).not.toBe(before);

    write(root, { "docs/agents/domain.md": "# Domain\n" });
    expect((await readSkillSetup(root, mirror)).fingerprint).not.toBe(withExtra);
  });
});

describe("deviationFingerprint", () => {
  const files = { ...tdd, ...triage, "docs/agents/issue-tracker.md": LOCAL_TRACKER };

  it("ignores changes that add no deviation: an extra skill, an edited doc", async () => {
    const { root, mirror } = await setup(files);
    const before = (await readSkillSetup(root, mirror)).deviationFingerprint;

    write(root, { ".agents/skills/mine/SKILL.md": "# mine\n", "docs/agents/domain.md": "# Domain\n" });
    expect((await readSkillSetup(root, mirror)).deviationFingerprint).toBe(before);
  });

  it("changes when a deviation appears, and when a skill that already differs changes again", async () => {
    const { root, mirror } = await setup(files);
    const clean = (await readSkillSetup(root, mirror)).deviationFingerprint;

    write(root, { ".agents/skills/tdd/SKILL.md": "# tdd, my way\n" });
    const differs = (await readSkillSetup(root, mirror)).deviationFingerprint;
    expect(differs).not.toBe(clean);
    expect((await readSkillSetup(root, mirror)).deviationFingerprint).toBe(differs);

    write(root, { ".agents/skills/tdd/SKILL.md": "# tdd, another way\n" });
    expect((await readSkillSetup(root, mirror)).deviationFingerprint).not.toBe(differs);
  });
});

describe("DEFAULT_SKILL_MIRROR", () => {
  it("ships every core skill", () => {
    for (const skill of DEFAULT_SKILL_MIRROR.core) expect(DEFAULT_SKILL_MIRROR.skills).toHaveProperty(skill);
  });

  it("matches the skills installed in this repo", async () => {
    const root = join(import.meta.dirname, "..", "..", "..");
    const report = await readSkillSetup(root);
    expect(report.deviations.filter((d) => d.kind === "skill-differs")).toEqual([]);
  });
});
