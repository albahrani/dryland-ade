import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  blocksInput,
  CLAUDE_CODE,
  commandForTicket,
  COPILOT_CLI,
  findExecutable,
  hookStateOf,
  type NextStep,
  resumeArgs,
  sessionExists,
  sessionIdArgs,
  skillCommand,
} from "../src/index.ts";

describe("skillCommand", () => {
  it("writes a next step's command with the CLI's skill prefix", () => {
    expect(skillCommand(CLAUDE_CODE, "/implement shop/02")).toBe("/implement shop/02");
    expect(skillCommand({ ...CLAUDE_CODE, skillPrefix: "$" }, "/implement shop/02")).toBe("$implement shop/02");
  });
});

describe("findExecutable", () => {
  const windows = process.platform === "win32";

  /** A directory holding `name` as a command this platform can run. */
  function binDir(name: string): string {
    const dir = mkdtempSync(join(tmpdir(), "dryland-bin-"));
    const file = join(dir, windows ? `${name}.cmd` : name);
    writeFileSync(file, windows ? "@echo off\r\n" : "#!/bin/sh\n");
    chmodSync(file, 0o755);
    return dir;
  }

  it("finds a command in a later PATH directory, as a full path", async () => {
    const empty = mkdtempSync(join(tmpdir(), "dryland-bin-"));
    const dir = binDir("claude");
    const found = await findExecutable("claude", { PATH: [empty, dir].join(delimiter) });
    expect(found).toBe(join(dir, windows ? "claude.cmd" : "claude"));
  });

  it("is null when no PATH directory holds the command", async () => {
    expect(await findExecutable("claude", { PATH: binDir("other") })).toBeNull();
  });

  it.skipIf(windows)("skips a file without the executable bit", async () => {
    const dir = mkdtempSync(join(tmpdir(), "dryland-bin-"));
    writeFileSync(join(dir, "claude"), "#!/bin/sh\n");
    expect(await findExecutable("claude", { PATH: dir })).toBeNull();
  });
});

/** What real Claude Code 2.1.300 printed on Windows, as the PTY delivered it (local paths replaced). */
const recorded = (name: string): string =>
  (JSON.parse(readFileSync(join(import.meta.dirname, "fixtures/claude-code", name), "utf8")) as string[]).join("");

describe("blocksInput (Claude Code)", () => {
  it("sees the folder trust dialog, whose spaces arrive as cursor moves", () => {
    expect(blocksInput(CLAUDE_CODE, recorded("trust-dialog.json"))).toBe(true);
  });

  it("sees the dialog redrawn after the user moves the selection", () => {
    const redraw = "\x1b[15;2H \x1b[1CNo,\x1b[1Cexit\x1b[16;2H❯\x1b[1CYes,\x1b[1CI\x1b[1Ctrust\x1b[1Cthis\x1b[1Cfolder";
    expect(blocksInput(CLAUDE_CODE, redraw)).toBe(true);
  });

  it.each([
    ["the first-run theme picker", "first-run-theme.json"],
    ["the external CLAUDE.md imports dialog", "external-imports.json"],
    ["the custom API key dialog", "api-key.json"],
  ])("sees %s", (_name, file) => {
    expect(blocksInput(CLAUDE_CODE, recorded(file))).toBe(true);
  });

  it("does not block at the input box", () => {
    expect(blocksInput(CLAUDE_CODE, recorded("input-box.json"))).toBe(false);
  });

  it("does not block at the input box of a CLI that is not logged in: it has no login screen", () => {
    expect(blocksInput(CLAUDE_CODE, recorded("not-logged-in.json"))).toBe(false);
  });
});

const step = (command: string | null, target: NextStep["target"], ruleId = "rule"): NextStep => ({
  ruleId,
  command,
  target,
  reason: "Because.",
  evidence: [],
});

describe("commandForTicket", () => {
  it("is the command of the best next step that targets the ticket", () => {
    const steps = [
      step("/implement-spec", { kind: "spec", map: "shop" }),
      step("/implement shop/03", { kind: "ticket", map: "shop", id: "03" }),
      step("/implement shop/02", { kind: "ticket", map: "shop", id: "02" }),
      step("/triage", { kind: "ticket", map: "shop", id: "02" }),
    ];
    expect(commandForTicket(steps, { map: "shop", id: "02" })).toBe("/implement shop/02");
  });

  it("skips steps without a skill, such as a stale-claim flag", () => {
    const steps = [
      step(null, { kind: "ticket", map: "shop", id: "02" }, "stale-claim"),
      step("/wayfinder shop", { kind: "ticket", map: "shop", id: "02" }),
    ];
    expect(commandForTicket(steps, { map: "shop", id: "02" })).toBe("/wayfinder shop");
  });

  it("is null when no next step points at the ticket, so nothing is pre-typed", () => {
    const steps = [step("/implement other/02", { kind: "ticket", map: "other", id: "02" })];
    expect(commandForTicket(steps, { map: "shop", id: "02" })).toBeNull();
  });
});

describe("sessionExists", () => {
  const worktree = join("T:", "Development", "shop", ".worktrees", "shop-02");

  it("finds a Claude Code session by its history file in the worktree's history directory", async () => {
    const home = mkdtempSync(join(tmpdir(), "home-"));
    const dir = join(home, ".claude", "projects", "T--Development-shop--worktrees-shop-02");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "abc.jsonl"), "{}\n");

    expect(await sessionExists(CLAUDE_CODE, home, worktree, "abc")).toBe(true);
    expect(await sessionExists(CLAUDE_CODE, home, worktree, "other")).toBe(false);
  });

  it("is false without a home directory or for a CLI with no history file to check", async () => {
    expect(await sessionExists(CLAUDE_CODE, null, worktree, "abc")).toBe(false);
    expect(await sessionExists({ ...CLAUDE_CODE, historyFile: null }, "/home", worktree, "abc")).toBe(false);
  });
});

describe("GitHub Copilot CLI adapter", () => {
  it("types the skill command in Copilot's syntax, for the launch to leave unsubmitted", () => {
    expect(skillCommand(COPILOT_CLI, "/implement shop/02")).toBe("/implement shop/02");
    expect(COPILOT_CLI.initialPrompt).toBe("pre-type");
    expect(COPILOT_CLI.launchArgs).toEqual([]);
  });

  it("gets its session id at launch with --session-id, and resumes with --resume=<id> or the picker", () => {
    expect(sessionIdArgs(COPILOT_CLI, "abc")).toEqual(["--session-id", "abc"]);
    expect(resumeArgs(COPILOT_CLI, "abc")).toEqual(["--resume=abc"]);
    expect(resumeArgs(COPILOT_CLI, null)).toEqual(["--resume"]);
    expect(COPILOT_CLI.sessionEnv).toBe("COPILOT_AGENT_SESSION_ID");
  });

  it("finds a session by its folder in session-state, whatever directory it ran in", async () => {
    const home = mkdtempSync(join(tmpdir(), "home-"));
    mkdirSync(join(home, ".copilot", "session-state", "abc"), { recursive: true });

    expect(await sessionExists(COPILOT_CLI, home, join("T:", "elsewhere"), "abc")).toBe(true);
    expect(await sessionExists(COPILOT_CLI, home, join("T:", "elsewhere"), "other")).toBe(false);
  });

  it.each([
    ["userPromptSubmitted", {}, "running"],
    ["preToolUse", {}, "running"],
    ["postToolUse", {}, "running"],
    ["permissionRequest", {}, "waiting"],
    ["notification", { notification_type: "permission_prompt" }, "waiting"],
    ["agentStop", {}, "idle"],
    ["sessionEnd", { reason: "user_exit" }, "ended"],
  ])("reports %s as %s", (event, payload, state) => {
    expect(hookStateOf(COPILOT_CLI, event, payload)).toBe(state);
  });

  it("says nothing for sessionStart, which fires only at the first prompt, nor for the idle notification", () => {
    expect(hookStateOf(COPILOT_CLI, "sessionStart", { source: "new" })).toBeNull();
    expect(hookStateOf(COPILOT_CLI, "notification", { notification_type: "agent_idle" })).toBeNull();
    expect(hookStateOf(COPILOT_CLI, "notification", undefined)).toBeNull();
  });

  it("sees the folder trust dialog, so nothing is typed into it", () => {
    expect(
      blocksInput(COPILOT_CLI, "Yes,\x1b[1Cand\x1b[1Cremember\x1b[1Cthis\x1b[1Cfolder\x1b[1Cfor\x1b[1Cfuture"),
    ).toBe(true);
    expect(blocksInput(COPILOT_CLI, "> Type @ to mention files")).toBe(false);
  });
});
