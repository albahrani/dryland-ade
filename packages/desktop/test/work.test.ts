import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CLAUDE_CODE, DrylandError, hookSettings, nodeProcessRunner } from "@dryland/core";
import { describe, expect, it, vi } from "vitest";
import { createDrylandCli } from "../src/main/dryland-cli.ts";
import { createTerminalManager } from "../src/main/terminals.ts";
import { createWorkStarter } from "../src/main/work.ts";
import { FakePtyProvider } from "./fake-pty.ts";
import { fixtureRepo } from "./fixture-repo.ts";

const windows = process.platform === "win32";

/** A PATH directory holding a stub `claude`; the fake PTY never runs it. */
function stubBin(): { dir: string; claude: string } {
  const dir = mkdtempSync(join(tmpdir(), "dryland-work-bin-"));
  const claude = join(dir, windows ? "claude.exe" : "claude");
  writeFileSync(claude, "");
  execFileSync(process.execPath, ["-e", `require("fs").chmodSync(${JSON.stringify(claude)}, 0o755)`]);
  return { dir, claude };
}

/** The real `dryland` bundle, built by the test suite's global setup; Node stands in for the app's Electron. */
const CLI = fileURLToPath(new URL("../../cli/dist/dryland.mjs", import.meta.url));

function setup(path = stubBin().dir, inherited: Record<string, string> = {}, autoCommit = true) {
  // The app hands terminals and the work starter the same environment, its own.
  const env = { PATH: path, HOME: "/home/test", ...inherited };
  // `dryland` runs with the test's own environment, which finds git; no app listens for it.
  const dryland = createDrylandCli({
    runtime: process.execPath,
    cli: CLI,
    env: {
      ...process.env,
      DRYLAND_PORT: undefined,
      DRYLAND_TOKEN: undefined,
      DRYLAND_APP_DIR: mkdtempSync(join(tmpdir(), "dryland-no-app-")),
    },
  });
  const provider = new FakePtyProvider();
  const hooksDir = join(mkdtempSync(join(tmpdir(), "dryland-app-")), "hooks");
  const terminals = createTerminalManager({
    provider,
    shell: { file: "/bin/fake-sh", args: [] },
    env,
    onData: () => {},
    onExit: () => {},
  });
  const starter = createWorkStarter({
    terminals,
    runner: nodeProcessRunner,
    env,
    launcherDir: "/opt/dryland/bin",
    hooksDir,
    dryland,
    autoCommit: () => autoCommit,
    pretype: { quietMs: 20, charDelayMs: 0 },
  });
  return { provider, starter, hooksDir, dryland };
}

const git = (repo: string, ...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
const grill = (repo: string) => readFileSync(join(repo, ".scratch/shop/issues/02-grill.md"), "utf8");

const typed = (pty: { written: string[] } | undefined) => pty?.written.join("") ?? "";
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** How many worktrees git knows for `repo`, the main checkout included. */
const worktreeCount = (repo: string) =>
  execFileSync("git", ["worktree", "list", "--porcelain"], { cwd: repo, encoding: "utf8" }).match(/^worktree /gm)
    ?.length;

describe("starting work on a ticket", () => {
  it("opens the Agent CLI in a new worktree for the ticket, with Dryland's environment", async () => {
    const repo = fixtureRepo();
    const bin = stubBin();
    const { provider, starter } = setup(bin.dir);

    const { session } = await starter.startWork(repo, { map: "shop", id: "02" }, "claude-code");

    expect(session.worktree.branch).toBe("shop/02-grill");
    expect(existsSync(join(session.worktree.path, ".scratch/shop/issues/02-grill.md"))).toBe(true);
    const options = provider.spawned[0]?.options;
    expect(options).toMatchObject({ file: bin.claude, cwd: session.worktree.path });
    expect(options?.env).toMatchObject({
      DRYLAND_SESSION_ID: session.id,
      DRYLAND_PANE_KEY: session.terminalId,
      HOME: "/home/test",
    });
    expect(options?.env.PATH?.split(delimiter)).toEqual(["/opt/dryland/bin", bin.dir]);
  });

  it("launches Claude Code with its status hooks from Dryland's own settings file, writing no user config", async () => {
    const home = mkdtempSync(join(tmpdir(), "dryland-home-"));
    const { provider, starter, hooksDir } = setup(undefined, { HOME: home, USERPROFILE: home });

    await starter.startWork(fixtureRepo(), { map: "shop", id: "02" }, "claude-code");

    const settingsFile = join(hooksDir, "claude-code.json");
    expect(provider.spawned[0]?.options.args).toEqual(["--settings", settingsFile]);
    expect(JSON.parse(readFileSync(settingsFile, "utf8"))).toEqual(hookSettings(CLAUDE_CODE.statusEvents));
    expect(readdirSync(home)).toEqual([]);
  });

  it("runs under the user's own login: it adds only the session's identity, no credentials", async () => {
    const { provider, starter } = setup();
    await starter.startWork(fixtureRepo(), { map: "shop", id: "02" }, "claude-code");
    const inherited = new Set(["PATH", "HOME", "TERM", "COLORTERM"]);
    const added = Object.keys(provider.spawned[0]?.options.env ?? {}).filter((key) => !inherited.has(key));
    expect(added.sort()).toEqual(["DRYLAND_PANE_KEY", "DRYLAND_SESSION_ID"]);
  });

  it("is not a child of the Claude Code session Dryland was started from, but keeps the user's own settings", async () => {
    const { provider, starter } = setup(undefined, {
      CLAUDECODE: "1",
      CLAUDE_CODE_CHILD_SESSION: "1",
      CLAUDE_CODE_SESSION_ID: "parent-session",
      CLAUDE_CODE_MESSAGING_SOCKET: "\\\\.\\pipe\\parent",
      CLAUDE_CODE_MESSAGING_TOKEN: "parent-token",
      CLAUDE_CODE_USE_BEDROCK: "1",
    });
    await starter.startWork(fixtureRepo(), { map: "shop", id: "02" }, "claude-code");
    const names = Object.keys(provider.spawned[0]?.options.env ?? {}).filter((key) => key.startsWith("CLAUDE"));
    expect(names).toEqual(["CLAUDE_CODE_USE_BEDROCK"]);
  });

  it("types the next-step command once the CLI has gone quiet, one key at a time, without submitting", async () => {
    const { provider, starter } = setup();
    const { session } = await starter.startWork(fixtureRepo(), { map: "shop", id: "02" }, "claude-code");
    const pty = provider.spawned[0];

    pty?.emit("Claude Code v2\r\n❯ ");
    await vi.waitFor(() => expect(typed(pty)).toBe("/implement shop/02"));
    expect(pty?.written.every((key) => key.length === 1)).toBe(true);
    expect(session.command).toBe("/implement shop/02");
    await pause(50);
    expect(typed(pty)).not.toContain("\r");
  });

  it("waits while a trust dialog shows and types once the CLI has redrawn its prompt", async () => {
    const { provider, starter } = setup();
    await starter.startWork(fixtureRepo(), { map: "shop", id: "02" }, "claude-code");
    const pty = provider.spawned[0];

    pty?.emit("Quick safety check \x1b[16;4HYes,\x1b[1CI\x1b[1Ctrust\x1b[1Cthis\x1b[1Cfolder");
    await pause(80);
    expect(typed(pty)).toBe("");

    pty?.emit("\x1b[2J❯ Try something");
    await vi.waitFor(() => expect(typed(pty)).toBe("/implement shop/02"));
  });

  it("types nothing when no next step points at the ticket", async () => {
    const { provider, starter } = setup();
    const { session } = await starter.startWork(fixtureRepo(), { map: "shop", id: "03" }, "claude-code");
    provider.spawned[0]?.emit("❯ ");
    await pause(80);
    expect(session.command).toBeNull();
    expect(typed(provider.spawned[0])).toBe("");
  });

  it("reuses the ticket's worktree when work starts on it again", async () => {
    const repo = fixtureRepo();
    const { starter } = setup();
    const { session: first } = await starter.startWork(repo, { map: "shop", id: "02" }, "claude-code");
    const { session: second } = await starter.startWork(repo, { map: "shop", id: "02" }, "claude-code");
    expect(second.worktree).toEqual(first.worktree);
    expect(worktreeCount(repo)).toBe(2);
  });

  it("records session, worktree and ticket at spawn", async () => {
    const { starter } = setup();
    const { session } = await starter.startWork(fixtureRepo(), { map: "shop", id: "02" }, "claude-code");
    expect(starter.sessions()).toEqual([session]);
    expect(session).toMatchObject({
      agent: { id: "claude-code", name: "Claude Code" },
      ticket: { map: "shop", id: "02" },
    });
  });

  it("shows an Agent CLI that is not installed as unavailable and does not launch it", async () => {
    const repo = fixtureRepo();
    const { provider, starter } = setup(mkdtempSync(join(tmpdir(), "dryland-work-empty-")));

    expect(await starter.listAgents()).toEqual([
      { id: "claude-code", name: "Claude Code", available: false, reason: "`claude` is not on PATH." },
    ]);
    await expect(starter.startWork(repo, { map: "shop", id: "02" }, "claude-code")).rejects.toThrow(DrylandError);
    expect(provider.spawned).toEqual([]);
    expect(worktreeCount(repo)).toBe(1);
  });

  it("claims the ticket for the session, and still types the command the unclaimed ticket called for", async () => {
    const repo = fixtureRepo();
    const { provider, starter } = setup();

    const { session, warnings } = await starter.startWork(repo, { map: "shop", id: "02" }, "claude-code");

    expect(warnings).toEqual([]);
    expect(grill(repo)).toContain(`"holder":"${session.id}"`);
    expect(git(repo, "log", "-1", "--format=%s")).toBe(`Claim shop/02 for ${session.id}`);
    provider.spawned[0]?.emit("❯ ");
    await vi.waitFor(() => expect(typed(provider.spawned[0])).toBe("/implement shop/02"));
  });

  it("claims without committing when auto-commit is off", async () => {
    const repo = fixtureRepo();
    const head = git(repo, "rev-parse", "HEAD");
    const { starter } = setup(undefined, {}, false);

    const { session } = await starter.startWork(repo, { map: "shop", id: "02" }, "claude-code");

    expect(grill(repo)).toContain(`"holder":"${session.id}"`);
    expect(git(repo, "rev-parse", "HEAD")).toBe(head);
  });

  it("starts anyway on a ticket someone else holds, leaving their claim alone and saying so", async () => {
    const repo = fixtureRepo();
    const { provider, starter, dryland } = setup();
    await dryland.run(["ticket", "claim", "shop/02"], { cwd: repo, sessionId: "someone-else" });

    const { warnings } = await starter.startWork(repo, { map: "shop", id: "02" }, "claude-code");

    expect(warnings).toEqual([expect.stringContaining("already claimed by someone-else")]);
    expect(grill(repo)).toContain('"holder":"someone-else"');
    expect(provider.spawned).toHaveLength(1);
  });

  it("lists an installed Agent CLI as available", async () => {
    const { starter } = setup();
    expect(await starter.listAgents()).toEqual([
      { id: "claude-code", name: "Claude Code", available: true, reason: null },
    ]);
  });
});
