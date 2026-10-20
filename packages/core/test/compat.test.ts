import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COMPAT_VERDICT_FILE,
  compatPrompt,
  fingerprintSkill,
  nextSteps,
  parseVerdict,
  readCompatibility,
  readSkillSetup,
  skillSetupSnapshot,
  type CompatConfig,
  type RepoSnapshot,
  type SkillMirror,
  type Ticket,
} from "../src/index.ts";

const TRACKER = "# Issue tracker: Local Markdown\n";

function write(root: string, files: Record<string, string>): void {
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  }
}

/** A modified setup: `triage` is a core skill of the mirror and is not installed; `tdd` is installed as default. */
async function modifiedRepo(extra: Record<string, string> = {}) {
  const defaults = mkdtempSync(join(tmpdir(), "dryland-compat-mirror-"));
  write(defaults, { "tdd/SKILL.md": "# tdd\n" });
  const mirror: SkillMirror = { skills: { tdd: await fingerprintSkill(join(defaults, "tdd")) }, core: ["triage"] };
  const root = mkdtempSync(join(tmpdir(), "dryland-compat-"));
  write(root, { ".agents/skills/tdd/SKILL.md": "# tdd\n", "docs/agents/issue-tracker.md": TRACKER, ...extra });
  const report = await readSkillSetup(root, mirror);
  return { root, mirror, report };
}

const verdictFile = (fingerprint: string, lines: string[]) =>
  `---\ndryland-compat: 1\nfingerprint: ${fingerprint}\n---\n\n${lines.join("\n")}\n`;
const NO_CONFIG: CompatConfig = { acceptedDeviations: null, overrides: [] };

describe("parseVerdict", () => {
  const fingerprint = "a".repeat(64);

  it("reads the header and a verdict with its reason per feature", () => {
    const parsed = parseVerdict(
      verdictFile(fingerprint, [
        "- map-frontier: ok",
        "- retro: broken - no retro skill",
        "- open-pr: degraded — slow",
      ]),
    );
    expect(parsed).toEqual({
      fingerprint,
      features: {
        "map-frontier": { verdict: "ok", reason: null },
        retro: { verdict: "broken", reason: "no retro skill" },
        "open-pr": { verdict: "degraded", reason: "slow" },
      },
    });
  });

  it.each([
    ["no header", "- retro: ok\n"],
    ["an unclosed header", "---\ndryland-compat: 1\n"],
    ["a wrong version", verdictFile("a".repeat(64), ["- retro: ok"]).replace(": 1", ": 2")],
    ["a bad fingerprint", verdictFile("abc", ["- retro: ok"])],
    ["a line that is no verdict", verdictFile(fingerprint, ["- retro: maybe"])],
    ["an unknown feature", verdictFile(fingerprint, ["- implement-tiket: broken"])],
    ["no features", verdictFile(fingerprint, [])],
  ])("rejects %s", (_name, text) => {
    expect(typeof parseVerdict(text)).toBe("string");
  });
});

describe("readCompatibility", () => {
  it("opens the dialog for a modified setup without a verdict", async () => {
    const { root, report } = await modifiedRepo();
    expect(report.state).toBe("modified");
    expect(await readCompatibility(root, report, NO_CONFIG)).toMatchObject({ needsDialog: true, verdict: null });
  });

  it("asks nothing of a setup that is not modified", async () => {
    const { root, mirror } = await modifiedRepo();
    const fine = await readSkillSetup(root, { skills: mirror.skills, core: [] });
    expect(fine.state).toBe("default");
    expect((await readCompatibility(root, fine, NO_CONFIG)).needsDialog).toBe(false);
  });

  it("parses a verdict: broken features are disabled with their reason, degraded ones carry a warning", async () => {
    const { root, report } = await modifiedRepo();
    write(root, {
      [COMPAT_VERDICT_FILE]: verdictFile(report.fingerprint, [
        "- map-frontier: ok",
        "- retro: broken - no retro skill",
        "- open-pr: degraded - slow",
      ]),
    });
    const compat = await readCompatibility(root, report, NO_CONFIG);
    expect(compat.needsDialog).toBe(false);
    expect(compat.features).toEqual([
      { id: "retro", verdict: "broken", reason: "no retro skill", disabled: true, overridden: false },
      { id: "open-pr", verdict: "degraded", reason: "slow", disabled: false, overridden: false },
    ]);
  });

  it("keeps a broken feature on once the user overrides it", async () => {
    const { root, report } = await modifiedRepo();
    write(root, { [COMPAT_VERDICT_FILE]: verdictFile(report.fingerprint, ["- retro: broken - gone"]) });
    const compat = await readCompatibility(root, report, { acceptedDeviations: null, overrides: ["retro"] });
    expect(compat.features).toEqual([
      { id: "retro", verdict: "broken", reason: "gone", disabled: false, overridden: true },
    ]);
  });

  it("ignores a verdict for an older fingerprint and asks again", async () => {
    const { root, report } = await modifiedRepo();
    write(root, { [COMPAT_VERDICT_FILE]: verdictFile("b".repeat(64), ["- retro: broken - gone"]) });
    expect(await readCompatibility(root, report, NO_CONFIG)).toMatchObject({
      needsDialog: true,
      verdict: null,
      features: [],
    });
  });

  it("stops asking once the deviations are accepted, until they change", async () => {
    const { root, mirror, report } = await modifiedRepo();
    const accepted: CompatConfig = { acceptedDeviations: report.deviationFingerprint, overrides: [] };
    expect((await readCompatibility(root, report, accepted)).needsDialog).toBe(false);

    write(root, { ".agents/skills/tdd/SKILL.md": "# tdd changed\n" });
    const changed = await readSkillSetup(root, mirror);
    expect((await readCompatibility(root, changed, accepted)).needsDialog).toBe(true);
  });

  it("treats a malformed verdict file as no verdict, with a note", async () => {
    const { root, report } = await modifiedRepo();
    write(root, { [COMPAT_VERDICT_FILE]: "not a verdict" });
    const compat = await readCompatibility(root, report, NO_CONFIG);
    expect(compat).toMatchObject({ needsDialog: true, verdict: null });
    expect(compat.note).toContain(COMPAT_VERDICT_FILE);
  });
});

describe("a verdict in the next steps", () => {
  const ticket = {
    map: "m",
    id: "01",
    title: "T01",
    state: "open",
    claimant: null,
    triageRole: "ready-for-agent",
    blockers: [],
    raw: {},
    body: "",
  } as unknown as Ticket;
  const snapshot = (skillSetup: RepoSnapshot["skillSetup"]): RepoSnapshot => ({
    setupConfigPresent: true,
    efforts: [{ name: "m", map: null, hasSpec: false }],
    tickets: [ticket],
    hasGlossary: false,
    adrCount: 0,
    git: null,
    sessions: null,
    skillSetup,
  });

  it("drops a broken rule's steps, and brings them back with an override", async () => {
    const { root, report } = await modifiedRepo();
    write(root, { [COMPAT_VERDICT_FILE]: verdictFile(report.fingerprint, ["- implement-ticket: broken - gone"]) });
    for (const [overrides, expected] of [
      [[], 0],
      [["implement-ticket"], 1],
    ] as const) {
      const config: CompatConfig = { acceptedDeviations: null, overrides: [...overrides] };
      const compat = await readCompatibility(root, report, config);
      const steps = nextSteps(snapshot(skillSetupSnapshot(report, compat, config)));
      expect(steps.filter((s) => s.ruleId === "implement-ticket")).toHaveLength(expected);
    }
  });

  it("pre-types only installed skills when there is no verdict", async () => {
    const { root, report } = await modifiedRepo();
    const compat = await readCompatibility(root, report, NO_CONFIG);
    expect(compat.verdict).toBeNull();
    // `implement` is not installed here, so the ready ticket recommends nothing.
    expect(nextSteps(snapshot(skillSetupSnapshot(report, compat)))).toEqual([]);
    const withSkill = { ...report, installed: [...report.installed, "implement"] };
    const steps = nextSteps(snapshot(skillSetupSnapshot(withSkill, compat)));
    expect(steps.map((s) => s.command)).toEqual(["/implement m/01"]);
  });
});

describe("compatPrompt", () => {
  it("names the verdict file, the format and the fingerprint the verdict is tied to", async () => {
    const { report } = await modifiedRepo();
    const prompt = compatPrompt(report);
    expect(prompt).toContain(COMPAT_VERDICT_FILE);
    expect(prompt).toContain(`fingerprint: ${report.fingerprint}`);
    expect(prompt).toContain("Core skill triage is not installed.");
  });
});
