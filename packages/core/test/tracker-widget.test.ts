import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { nodeProcessRunner, readTrackerWidget } from "../src/index.ts";

function repo(doc: string | null): string {
  const root = mkdtempSync(join(tmpdir(), "dryland-widget-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root });
  git("init", "--quiet", "--initial-branch=main");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "T");
  if (doc !== null) {
    mkdirSync(dirname(join(root, "docs/agents/issue-tracker.md")), { recursive: true });
    writeFileSync(join(root, "docs/agents/issue-tracker.md"), doc);
  }
  writeFileSync(join(root, "README.md"), "hi\n");
  git("add", ".");
  git("commit", "--quiet", "-m", "init");
  return root;
}

const ADE_DOC = "# Issue tracker: GitHub\n\nChange tickets only with `dryland ticket claim`.\n";

describe("readTrackerWidget", () => {
  it("names the tracker and is not in lens mode when the doc sends agents through dryland", async () => {
    const info = await readTrackerWidget(nodeProcessRunner, repo(ADE_DOC));

    expect(info).toMatchObject({ kind: "github", lens: false, offDefaultBranch: null });
  });

  it("is in lens mode when the doc never mentions dryland", async () => {
    const info = await readTrackerWidget(nodeProcessRunner, repo("# Issue tracker: GitLab\n\nUse glab.\n"));

    expect(info).toMatchObject({ kind: "gitlab", lens: true });
  });

  it("warns when a local-markdown project's main checkout is off the default branch", async () => {
    const root = repo("# Issue tracker: Local Markdown\n\n`dryland ticket list`\n");
    execFileSync("git", ["switch", "--quiet", "-c", "feature"], { cwd: root });

    const info = await readTrackerWidget(nodeProcessRunner, root);

    expect(info).toMatchObject({
      kind: "local-markdown",
      offDefaultBranch: { current: "feature", defaultBranch: "main" },
    });
  });

  it("does not warn about the branch of a remote-tracker project", async () => {
    const root = repo(ADE_DOC);
    execFileSync("git", ["switch", "--quiet", "-c", "feature"], { cwd: root });

    expect((await readTrackerWidget(nodeProcessRunner, root))?.offDefaultBranch).toBeNull();
  });

  it("is null for a repo whose tracker doc is missing", async () => {
    expect(await readTrackerWidget(nodeProcessRunner, repo(null))).toBeNull();
  });
});
