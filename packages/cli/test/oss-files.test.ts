import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error The generator is a plain script with no type declarations.
import { buildNotices } from "../../../scripts/third-party-notices.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (file: string) => readFileSync(join(root, file), "utf8").replace(/\r\n/g, "\n");

describe("the files a visitor and a contributor expect", () => {
  it.each([
    "LICENSE",
    "THIRD_PARTY_NOTICES.md",
    "CONTRIBUTING.md",
    "CODE_OF_CONDUCT.md",
    "SECURITY.md",
    "CHANGELOG.md",
    "README.md",
    ".github/PULL_REQUEST_TEMPLATE.md",
    ".github/ISSUE_TEMPLATE/bug.yml",
    ".github/ISSUE_TEMPLATE/feature-request.yml",
    ".github/ISSUE_TEMPLATE/skill-setup-compatibility.yml",
    "docs/manual/README.md",
  ])("%s exists with real content", (file) => {
    expect(existsSync(join(root, file))).toBe(true);
    expect(read(file).length).toBeGreaterThan(300);
    expect(read(file)).not.toMatch(/\b(TODO|TBD|lorem ipsum|placeholder text)\b/i);
  });

  it("licenses the project MIT to the Dryland ADE contributors", () => {
    expect(read("LICENSE")).toContain("MIT License");
    expect(read("LICENSE")).toContain("Dryland ADE contributors");
  });

  it("states in the README that Dryland is unofficial and credits Matt Pocock's skills", () => {
    const readme = read("README.md");
    expect(readme).toMatch(/unofficial, community-made/i);
    expect(readme).toContain("Matt Pocock");
    expect(readme).toMatch(/not affiliated/i);
    expect(readme).toMatch(/terms/i);
    expect(readme).toContain(".scratch");
  });

  it("documents how to get past SmartScreen and Gatekeeper", () => {
    const readme = read("README.md");
    expect(readme).toContain("SmartScreen");
    expect(readme).toContain("More info");
    expect(readme).toContain("Gatekeeper");
    expect(readme).toMatch(/Open Anyway/);
  });

  it("covers opening a project, the views, starting work and the dryland CLI in the manual", () => {
    const manual = read("docs/manual/README.md");
    for (const topic of ["Opening a project", "The views", "Starting work", "The `dryland` CLI"]) {
      expect(manual).toContain(`## ${topic}`);
    }
  });

  it("has issue forms for a bug with doctor output, a feature and a skill-setup compatibility report", () => {
    expect(read(".github/ISSUE_TEMPLATE/bug.yml")).toContain("dryland doctor");
    for (const form of ["bug", "feature-request", "skill-setup-compatibility"]) {
      const text = read(`.github/ISSUE_TEMPLATE/${form}.yml`);
      expect(text).toMatch(/^name: .+/m);
      expect(text).toMatch(/^description: .+/m);
      expect(text).toMatch(/^body:/m);
      expect(text).toContain("type: textarea");
    }
  });

  it("has a PR template checklist for tests, ADR impact and the glossary", () => {
    const template = read(".github/PULL_REQUEST_TEMPLATE.md");
    expect(template).toMatch(/- \[ \] .*tests/i);
    expect(template).toMatch(/- \[ \] .*ADR/);
    expect(template).toMatch(/- \[ \] .*GLOSSARY/);
  });
});

describe("THIRD_PARTY_NOTICES.md", () => {
  it("is up to date with what the packages ship", () => {
    expect(read("THIRD_PARTY_NOTICES.md")).toBe(buildNotices(root));
  });

  it("attributes Orca under its licence", () => {
    const notices = read("THIRD_PARTY_NOTICES.md");
    expect(notices).toContain("## Orca");
    expect(notices).toContain("Lovecast Inc.");
  });
});
