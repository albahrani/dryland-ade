import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  initStore,
  installAgentHooks,
  nodeProcessRunner,
  readAgentHooks,
  removeAgentHooks,
  runDoctor,
  type ProcessRunner,
} from "../src/index.ts";

process.env["DRYLAND_DATA_DIR"] ??= mkdtempSync(join(tmpdir(), "dryland-data-"));

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), "dryland-doctor-"));
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  const files: Record<string, string> = {
    "docs/agents/triage-labels.md": "# Labels\n",
    "docs/agents/domain.md": "# Domain\n",
    ".agents/skills/tdd/SKILL.md": "# tdd\n",
  };
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  }
  return root;
}

/** Real git; any other command is not installed. */
function runnerWith(): ProcessRunner {
  return {
    async run(command, args, options) {
      if (command === "git") return nodeProcessRunner.run(command, args, options);
      return { stdout: "", stderr: `${command}: command not found`, exitCode: 127 };
    },
  };
}

const noPath = { env: { PATH: "" } };

describe("runDoctor store check", () => {
  it("fails in a repo without a state store, naming dryland init", async () => {
    const report = await runDoctor(runnerWith(), repo(), noPath);

    const store = report.checks.find((c) => c.id === "store");
    expect(store).toMatchObject({ ok: false });
    expect(store?.nextAction).toContain("dryland init");
    expect(report.ok).toBe(false);
  });

  it("passes once the repo has a state store, and runs no forge CLI", async () => {
    const root = repo();
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "--allow-empty", "-qm", "i"], {
      cwd: root,
    });
    await initStore(root);

    const report = await runDoctor(runnerWith(), root, noPath);

    expect(report.checks.find((c) => c.id === "store")).toMatchObject({ ok: true });
  });
});

describe("runDoctor outside a git repository", () => {
  it("still reports every check, failing setup and the store with the cause", async () => {
    const outside = mkdtempSync(join(tmpdir(), "dryland-notrepo-"));

    const report = await runDoctor(nodeProcessRunner, outside, { ...noPath, home: tmpdir() });

    expect(report.ok).toBe(false);
    expect(report.checks.map((c) => [c.id, c.ok])).toEqual([
      ["setup", false],
      ["store", false],
      ["path", false],
      ["hooks", true],
    ]);
    expect(report.checks[0]?.detail).toContain("not inside a git repository");
  });
});

describe("runDoctor hooks check", () => {
  /** A `PATH` holding a runnable `copilot`, and a Copilot home to install into. */
  function withCopilot() {
    const bin = mkdtempSync(join(tmpdir(), "dryland-copilot-bin-"));
    const name = process.platform === "win32" ? "copilot.cmd" : "copilot";
    writeFileSync(join(bin, name), "@echo off\n");
    chmodSync(join(bin, name), 0o755);
    const home = mkdtempSync(join(tmpdir(), "dryland-copilot-home-"));
    return { options: { env: { PATH: bin }, home }, home };
  }

  it("passes when Copilot CLI is not installed: there are no hooks to check", async () => {
    const report = await runDoctor(runnerWith(), repo(), { ...noPath, home: tmpdir() });

    expect(report.checks.find((c) => c.id === "hooks")).toMatchObject({ ok: true });
  });

  it("fails with the next action when Copilot is installed but has no Dryland hook file", async () => {
    const { options } = withCopilot();

    const report = await runDoctor(runnerWith(), repo(), options);

    expect(report.checks.find((c) => c.id === "hooks")).toMatchObject({
      ok: false,
      nextAction: expect.stringContaining("dryland doctor --install-hooks"),
    });
  });

  it("installs the hook file and trusts the linked worktrees, then removes both", async () => {
    const { options, home } = withCopilot();
    const root = repo();
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "--allow-empty", "-m", "i", "-q"], {
      cwd: root,
    });
    await initStore(root);
    const worktree = join(root, "..", `${basename(root)}-wt`);
    execFileSync("git", ["worktree", "add", "-q", "-b", "shop/01-x", worktree], { cwd: root });
    const config = join(home, ".copilot", "config.json");
    mkdirSync(join(home, ".copilot"), { recursive: true });
    writeFileSync(config, '{\n  "trustedFolders": []\n}\n');

    const installed = await installAgentHooks(nodeProcessRunner, root, options);
    const report = await runDoctor(nodeProcessRunner, root, options);

    expect(installed.warnings).toEqual([]);
    expect(report.checks.find((c) => c.id === "hooks")).toMatchObject({
      ok: true,
      detail: expect.stringContaining("1 of 1 worktrees are trusted"),
    });

    await removeAgentHooks(nodeProcessRunner, root, options);

    expect(readFileSync(config, "utf8").replace(/\s/g, "")).toBe('{"trustedFolders":[]}');
    expect((await runDoctor(nodeProcessRunner, root, options)).checks.find((c) => c.id === "hooks")?.ok).toBe(false);
  });
});

describe("readAgentHooks", () => {
  it("reports what Dryland wrote: the hook file's text and the trusted worktrees", async () => {
    const home = mkdtempSync(join(tmpdir(), "dryland-copilot-home-"));
    const options = { env: { PATH: "" }, home };
    const root = repo();
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "--allow-empty", "-m", "i", "-q"], {
      cwd: root,
    });
    await initStore(root);
    const worktree = join(root, "..", `${basename(root)}-wt2`);
    execFileSync("git", ["worktree", "add", "-q", "-b", "shop/02-x", worktree], { cwd: root });
    mkdirSync(join(home, ".copilot"), { recursive: true });
    writeFileSync(join(home, ".copilot", "config.json"), '{\n  "trustedFolders": []\n}\n');

    const before = await readAgentHooks(nodeProcessRunner, root, options);
    expect(before).toMatchObject({ status: "missing", hookFileText: null, trusted: [] });
    expect(before.worktrees).toHaveLength(1);

    await installAgentHooks(nodeProcessRunner, root, options);
    const after = await readAgentHooks(nodeProcessRunner, root, options);

    expect(after.status).toBe("installed");
    expect(after.hookFileText).toBe(readFileSync(after.hookFile, "utf8"));
    expect(after.trusted).toHaveLength(1);
    expect(after.config).toBe(join(home, ".copilot", "config.json"));
  });

  it("installs the hook file alone when no project is open, and removes it again", async () => {
    const home = mkdtempSync(join(tmpdir(), "dryland-copilot-home-"));
    const options = { env: { PATH: "" }, home };

    const installed = await installAgentHooks(nodeProcessRunner, null, options);
    expect((await readAgentHooks(nodeProcessRunner, null, options)).status).toBe("installed");
    expect(installed.lines[0]).toContain("Installed");

    await removeAgentHooks(nodeProcessRunner, null, options);
    expect((await readAgentHooks(nodeProcessRunner, null, options)).status).toBe("missing");
  });
});
