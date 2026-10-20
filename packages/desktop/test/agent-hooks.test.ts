import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { COPILOT_CLI, nodeProcessRunner } from "@dryland/core";
import { describe, expect, it } from "vitest";
import { createAgentHooksControl } from "../src/main/agent-hooks.ts";
import { describeAgentHooks } from "../src/shared/agent-hooks.ts";
import { fixtureRepo } from "./fixture-repo.ts";

function control() {
  const home = mkdtempSync(join(tmpdir(), "dryland-agent-hooks-"));
  mkdirSync(join(home, ".copilot"), { recursive: true });
  writeFileSync(join(home, ".copilot", "config.json"), '{\n  "trustedFolders": []\n}\n');
  return { home, hooks: createAgentHooksControl({ runner: nodeProcessRunner, env: { PATH: "" }, home }) };
}

describe("agent hooks control", () => {
  it("has nothing to show for a CLI that takes its hooks per launch", async () => {
    const { hooks } = control();
    expect(await hooks.read("claude-code", null)).toBeNull();
    expect(await hooks.change("claude-code", null, "install")).toBeNull();
  });

  it("installs and removes Copilot's hook file, as `dryland doctor` does, and inspects what it wrote", async () => {
    const { home, hooks } = control();
    const file = join(home, ".copilot", "hooks", "dryland.json");

    expect((await hooks.read(COPILOT_CLI.id, null))?.status).toBe("missing");

    const installed = await hooks.change(COPILOT_CLI.id, null, "install");
    expect(installed?.hooks.status).toBe("installed");
    expect(installed?.hooks.hookFileText).toBe(readFileSync(file, "utf8"));

    const removed = await hooks.change(COPILOT_CLI.id, null, "remove");
    expect(removed?.hooks).toMatchObject({ status: "missing", hookFileText: null });
  });

  it("counts the project's trusted worktrees", async () => {
    const { hooks } = control();
    const repo = fixtureRepo();
    expect(describeAgentHooks((await hooks.read(COPILOT_CLI.id, repo))!)).toBe("Hook file not installed");
  });
});
