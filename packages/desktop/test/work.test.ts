import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CLAUDE_CODE,
  COMPAT_RUN_COMMAND,
  DrylandError,
  hookSettings,
  nodeProcessRunner,
  readSessionIndex,
} from "@dryland/core";
import { describe, expect, it, vi } from "vitest";
import { createDrylandCli } from "../src/main/dryland-cli.ts";
import { createTerminalManager } from "../src/main/terminals.ts";
import { createWorkStarter } from "../src/main/work.ts";
import { FakePtyProvider } from "./fake-pty.ts";
import { fixtureRepo } from "./fixture-repo.ts";

const windows = process.platform === "win32";

/** A PATH directory holding a stub `claude`, and any `others`; the fake PTY never runs them. */
function stubBin(others: string[] = []): { dir: string; claude: string } {
  const dir = mkdtempSync(join(tmpdir(), "dryland-work-bin-"));
  const claude = join(dir, windows ? "claude.exe" : "claude");
  for (const name of ["claude", ...others]) {
    const file = join(dir, windows ? `${name}.exe` : name);
    writeFileSync(file, "");
    execFileSync(process.execPath, ["-e", `require("fs").chmodSync(${JSON.stringify(file)}, 0o755)`]);
  }
  return { dir, claude };
}

/** The real `dryland` bundle, built by the test suite's global setup; Node stands in for the app's Electron. */
const CLI = fileURLToPath(new URL("../../cli/dist/dryland.mjs", import.meta.url));

function setup(
  path = stubBin().dir,
  inherited: Record<string, string> = {},
  autoCommit = true,
  autoSubmit = false,
  submitFor?: (project: string) => boolean,
) {
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
    autoSubmit: submitFor ?? (() => autoSubmit),
    pretype: { quietMs: 20, charDelayMs: 0 },
  });
  return { provider, starter, hooksDir, dryland };
}

const git = (repo: string, ...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
const grill = (repo: string) => readFileSync(join(repo, ".scratch/shop/issues/02-grill.md"), "utf8");

const onTicket = (id: string) => ({ kind: "ticket" as const, ticket: { map: "shop", id } });

/** Installs skill `name` for Claude Code under `root`, as a directory with a `SKILL.md`. */
function installSkill(root: string, name: string): void {
  mkdirSync(join(root, ".claude/skills", name), { recursive: true });
  writeFileSync(join(root, ".claude/skills", name, "SKILL.md"), `---\nname: ${name}\n---\n`);
}

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

    const { session } = await starter.startWork(repo, onTicket("02"), "claude-code");

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

    const { session } = await starter.startWork(fixtureRepo(), onTicket("02"), "claude-code");

    const settingsFile = join(hooksDir, "claude-code.json");
    expect(provider.spawned[0]?.options.args).toEqual([
      "--session-id",
      session.agentSessionId,
      "--settings",
      settingsFile,
    ]);
    expect(JSON.parse(readFileSync(settingsFile, "utf8"))).toEqual(hookSettings(CLAUDE_CODE.statusEvents));
    expect(readdirSync(home)).toEqual([]);
  });

  it("runs under the user's own login: it adds only the session's identity, no credentials", async () => {
    const { provider, starter } = setup();
    await starter.startWork(fixtureRepo(), onTicket("02"), "claude-code");
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
    await starter.startWork(fixtureRepo(), onTicket("02"), "claude-code");
    const names = Object.keys(provider.spawned[0]?.options.env ?? {}).filter((key) => key.startsWith("CLAUDE"));
    expect(names).toEqual(["CLAUDE_CODE_USE_BEDROCK"]);
  });

  it("types the next-step command once the CLI has gone quiet, one key at a time, without submitting", async () => {
    const { provider, starter } = setup();
    const { session } = await starter.startWork(fixtureRepo(), onTicket("02"), "claude-code");
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
    await starter.startWork(fixtureRepo(), onTicket("02"), "claude-code");
    const pty = provider.spawned[0];

    pty?.emit("Quick safety check \x1b[16;4HYes,\x1b[1CI\x1b[1Ctrust\x1b[1Cthis\x1b[1Cfolder");
    await pause(80);
    expect(typed(pty)).toBe("");

    pty?.emit("\x1b[2J❯ Try something");
    await vi.waitFor(() => expect(typed(pty)).toBe("/implement shop/02"));
  });

  it("types nothing when no next step points at the ticket", async () => {
    const { provider, starter } = setup();
    const { session } = await starter.startWork(fixtureRepo(), onTicket("03"), "claude-code");
    provider.spawned[0]?.emit("❯ ");
    await pause(80);
    expect(session.command).toBeNull();
    expect(typed(provider.spawned[0])).toBe("");
  });

  it("reuses the ticket's worktree when work starts on it again", async () => {
    const repo = fixtureRepo();
    const { starter } = setup();
    const { session: first } = await starter.startWork(repo, onTicket("02"), "claude-code");
    const { session: second } = await starter.startWork(repo, onTicket("02"), "claude-code");
    expect(second.worktree).toEqual(first.worktree);
    expect(worktreeCount(repo)).toBe(2);
  });

  it("records session, worktree and ticket at spawn", async () => {
    const { starter } = setup();
    const { session } = await starter.startWork(fixtureRepo(), onTicket("02"), "claude-code");
    expect(starter.sessions()).toEqual([session]);
    expect(session).toMatchObject({
      agent: { id: "claude-code", name: "Claude Code" },
      ticket: { map: "shop", id: "02" },
      map: "shop",
    });
  });

  it("launches the CLI with a session id of its own and holds it in the index for the ticket right after spawn", async () => {
    const repo = fixtureRepo();
    const { starter } = setup();

    const { session } = await starter.startWork(repo, onTicket("02"), "claude-code");

    expect(session.agentSessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(session.agentSessionId).not.toBe(session.id);
    const { index } = await readSessionIndex(nodeProcessRunner, repo);
    expect(index.items["shop/02"]).toEqual([
      { adapter: "claude-code", sessionId: session.agentSessionId, lastSeen: expect.any(String) },
    ]);
  });

  it("gives every launch a new CLI session id, newest first in the index", async () => {
    const repo = fixtureRepo();
    const { starter } = setup();

    const { session: first } = await starter.startWork(repo, onTicket("02"), "claude-code");
    const { session: second } = await starter.startWork(repo, onTicket("02"), "claude-code");

    const { index } = await readSessionIndex(nodeProcessRunner, repo);
    expect(index.items["shop/02"]?.map((s) => s.sessionId)).toEqual([second.agentSessionId, first.agentSessionId]);
  });

  it("shows an Agent CLI that is not installed as unavailable and does not launch it", async () => {
    const repo = fixtureRepo();
    const { provider, starter } = setup(mkdtempSync(join(tmpdir(), "dryland-work-empty-")));

    expect(await starter.listAgents()).toEqual([
      { id: "claude-code", name: "Claude Code", available: false, reason: "`claude` is not on PATH." },
      { id: "copilot-cli", name: "GitHub Copilot CLI", available: false, reason: "`copilot` is not on PATH." },
      { id: "codex-cli", name: "Codex CLI", available: false, reason: "`codex` is not on PATH." },
      { id: "gemini-cli", name: "Gemini CLI", available: false, reason: "`gemini` is not on PATH." },
    ]);
    await expect(starter.startWork(repo, onTicket("02"), "claude-code")).rejects.toThrow(DrylandError);
    expect(provider.spawned).toEqual([]);
    expect(worktreeCount(repo)).toBe(1);
  });

  it("claims the ticket for its worktree branch, and still types the command the unclaimed ticket called for", async () => {
    const repo = fixtureRepo();
    const { provider, starter } = setup();

    const { session, warnings } = await starter.startWork(repo, onTicket("02"), "claude-code");

    expect(warnings).toEqual([]);
    expect(grill(repo)).not.toContain(session.id);
    expect(git(repo, "log", "-1", "--format=%s")).toBe("Claim shop/02 for shop/02-grill");
    const shown = execFileSync(process.execPath, [CLI, "ticket", "show", "shop/02", "--json"], {
      cwd: repo,
      encoding: "utf8",
    });
    expect(JSON.parse(shown)).toMatchObject({ state: "claimed", claimant: "shop/02-grill" });
    provider.spawned[0]?.emit("❯ ");
    await vi.waitFor(() => expect(typed(provider.spawned[0])).toBe("/implement shop/02"));
  });

  it("keeps the claim when work starts on the ticket again, its branch already holding it", async () => {
    const repo = fixtureRepo();
    const { starter } = setup();
    await starter.startWork(repo, onTicket("02"), "claude-code");
    const head = git(repo, "rev-parse", "HEAD");

    const { warnings } = await starter.startWork(repo, onTicket("02"), "claude-code");

    expect(warnings).toEqual([]);
    expect(git(repo, "rev-parse", "HEAD")).toBe(head);
  });

  it("claims without committing when auto-commit is off", async () => {
    const repo = fixtureRepo();
    const head = git(repo, "rev-parse", "HEAD");
    const { starter } = setup(undefined, {}, false);

    await starter.startWork(repo, onTicket("02"), "claude-code");

    expect(grill(repo)).toContain('"holder":"shop/02-grill"');
    expect(git(repo, "rev-parse", "HEAD")).toBe(head);
  });

  it("starts anyway on a ticket someone else holds, leaving their claim alone and saying so", async () => {
    const repo = fixtureRepo();
    const { provider, starter, dryland } = setup();
    await dryland.run(["ticket", "claim", "shop/02"], { cwd: repo });

    const { warnings } = await starter.startWork(repo, onTicket("02"), "claude-code");

    expect(warnings).toEqual([expect.stringContaining("already claimed by main")]);
    expect(grill(repo)).toContain('"holder":"main"');
    expect(provider.spawned).toHaveLength(1);
  });

  it("lists an installed Agent CLI as available", async () => {
    const { starter } = setup();
    expect(await starter.listAgents()).toEqual([
      { id: "claude-code", name: "Claude Code", available: true, reason: null },
      { id: "copilot-cli", name: "GitHub Copilot CLI", available: false, reason: "`copilot` is not on PATH." },
      { id: "codex-cli", name: "Codex CLI", available: false, reason: "`codex` is not on PATH." },
      { id: "gemini-cli", name: "Gemini CLI", available: false, reason: "`gemini` is not on PATH." },
    ]);
  });
});

describe("continuing a map and starting a new one", () => {
  it("continues a map in its own scratch worktree with /wayfinder <map> typed, claiming nothing", async () => {
    const repo = fixtureRepo();
    const head = git(repo, "rev-parse", "HEAD");
    const { provider, starter } = setup();

    const { session } = await starter.startWork(repo, { kind: "map", map: "shop" }, "claude-code");

    expect(session).toMatchObject({
      ticket: null,
      map: "shop",
      project: repo,
      worktree: { branch: "shop/scratch-wayfinder" },
    });
    expect(provider.spawned[0]?.options.cwd).toBe(session.worktree.path);
    provider.spawned[0]?.emit("❯ ");
    await vi.waitFor(() => expect(typed(provider.spawned[0])).toBe("/wayfinder shop"));
    expect(git(repo, "rev-parse", "HEAD")).toBe(head);
    expect(grill(repo)).not.toContain("holder");
  });

  it("reuses the map's scratch worktree when the map is continued again", async () => {
    const repo = fixtureRepo();
    const { starter } = setup();
    const { session: first } = await starter.startWork(repo, { kind: "map", map: "shop" }, "claude-code");
    const { session: second } = await starter.startWork(repo, { kind: "map", map: "shop" }, "claude-code");
    expect(second.worktree).toEqual(first.worktree);
    expect(worktreeCount(repo)).toBe(2);
  });

  it("starts a new map in a new temporary worktree with /wayfinder typed and writes no map file", async () => {
    const repo = fixtureRepo();
    const { provider, starter } = setup();

    const { session: first } = await starter.startWork(repo, { kind: "new-map" }, "claude-code");
    const { session: second } = await starter.startWork(repo, { kind: "new-map" }, "claude-code");

    expect(first).toMatchObject({ ticket: null, map: null, worktree: { branch: "new-map/scratch-wayfinder" } });
    expect(second.worktree.branch).toBe("new-map/scratch-wayfinder-2");
    provider.spawned[0]?.emit("❯ ");
    await vi.waitFor(() => expect(typed(provider.spawned[0])).toBe("/wayfinder "));
    await pause(50);
    expect(typed(provider.spawned[0])).not.toContain("\r");
    expect(readdirSync(join(repo, ".scratch"))).toEqual(["shop"]);
    expect(readdirSync(join(first.worktree.path, ".scratch"))).toEqual(["shop"]);
    expect(git(repo, "status", "--porcelain")).toBe("");
  });

  it("records a map's session under the map, and a new map's under its scratch worktree branch", async () => {
    const repo = fixtureRepo();
    const { starter } = setup();

    const { session: map } = await starter.startWork(repo, { kind: "map", map: "shop" }, "claude-code");
    const { session: newMap } = await starter.startWork(repo, { kind: "new-map" }, "claude-code");

    const { index } = await readSessionIndex(nodeProcessRunner, repo);
    expect(index.items["shop"]?.map((s) => s.sessionId)).toEqual([map.agentSessionId]);
    expect(index.items["new-map/scratch-wayfinder"]?.map((s) => s.sessionId)).toEqual([newMap.agentSessionId]);
  });
});

describe("starting a session without a ticket", () => {
  it("opens the Agent CLI in a new scratch worktree with nothing typed, claiming nothing", async () => {
    const repo = fixtureRepo();
    const head = git(repo, "rev-parse", "HEAD");
    const { provider, starter } = setup();

    const { session: first } = await starter.startWork(repo, { kind: "scratch" }, "claude-code");
    const { session: second } = await starter.startWork(repo, { kind: "scratch" }, "claude-code");

    expect(first).toMatchObject({
      ticket: null,
      map: null,
      command: null,
      worktree: { branch: "scratch/scratch-session" },
    });
    expect(second.worktree.branch).toBe("scratch/scratch-session-2");
    expect(provider.spawned[0]?.options.cwd).toBe(first.worktree.path);
    provider.spawned[0]?.emit("❯ ");
    await pause(50);
    expect(typed(provider.spawned[0])).toBe("");
    expect(git(repo, "rev-parse", "HEAD")).toBe(head);
    expect(git(repo, "status", "--porcelain")).toBe("");
  });

  it("types the chosen skill, and records the session under its scratch worktree branch", async () => {
    const home = mkdtempSync(join(tmpdir(), "dryland-home-"));
    installSkill(home, "grilling");
    const repo = fixtureRepo();
    const { provider, starter } = setup(undefined, { HOME: home, USERPROFILE: home });

    const { session } = await starter.startWork(repo, { kind: "scratch" }, "claude-code", "grilling");

    provider.spawned[0]?.emit("❯ ");
    await vi.waitFor(() => expect(typed(provider.spawned[0])).toBe("/grilling "));
    const { index } = await readSessionIndex(nodeProcessRunner, repo);
    expect(index.items["scratch/scratch-session"]?.map((s) => s.sessionId)).toEqual([session.agentSessionId]);
  });
});

describe("the Compatibility check session", () => {
  it("opens a scratch session with the compatibility prompt command typed, not a skill", async () => {
    const repo = fixtureRepo();
    const { provider, starter } = setup();

    const { session } = await starter.startWork(repo, { kind: "compat-check" }, "claude-code");

    expect(session).toMatchObject({ ticket: null, map: null, worktree: { branch: "scratch/scratch-session" } });
    provider.spawned[0]?.emit("❯ ");
    await vi.waitFor(() => expect(typed(provider.spawned[0])).toBe(COMPAT_RUN_COMMAND));
  });
});

describe("launching any installed skill", () => {
  function withSkills() {
    const repo = fixtureRepo();
    const home = mkdtempSync(join(tmpdir(), "dryland-home-"));
    installSkill(repo, "grilling");
    installSkill(home, "tdd");
    // A directory without a SKILL.md is not a skill.
    mkdirSync(join(repo, ".claude/skills/notes"), { recursive: true });
    return { repo, ...setup(undefined, { HOME: home, USERPROFILE: home }) };
  }

  it("lists the skills installed in the project and in the user's home", async () => {
    const { repo, starter } = withSkills();
    expect(await starter.listSkills(repo, "claude-code")).toEqual(["grilling", "tdd"]);
  });

  it("types the chosen skill naming the ticket instead of the recommended command", async () => {
    const { repo, provider, starter } = withSkills();
    const { session } = await starter.startWork(repo, onTicket("02"), "claude-code", "grilling");
    provider.spawned[0]?.emit("❯ ");
    await vi.waitFor(() => expect(typed(provider.spawned[0])).toBe("/grilling shop/02"));
    expect(session.command).toBe("/grilling shop/02");
  });

  it("types the chosen skill naming the map when a map is continued", async () => {
    const { repo, provider, starter } = withSkills();
    await starter.startWork(repo, { kind: "map", map: "shop" }, "claude-code", "tdd");
    provider.spawned[0]?.emit("❯ ");
    await vi.waitFor(() => expect(typed(provider.spawned[0])).toBe("/tdd shop"));
  });

  it("refuses a skill that is not installed, before touching anything", async () => {
    const { repo, provider, starter } = withSkills();
    await expect(starter.startWork(repo, onTicket("02"), "claude-code", "notes")).rejects.toThrow(DrylandError);
    expect(provider.spawned).toEqual([]);
    expect(worktreeCount(repo)).toBe(1);
  });
});

describe("resuming a paused session", () => {
  const ticket = { map: "shop", id: "02" };

  /** A home where Claude Code holds the history of `sessionId` run in `worktree`. */
  function homeWithHistory(worktree: string, sessionId: string): string {
    const home = mkdtempSync(join(tmpdir(), "dryland-home-"));
    const file = CLAUDE_CODE.historyFile?.(home, worktree, sessionId) ?? "";
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, "{}\n");
    return home;
  }

  /** Work started on ticket 02 and its CLI stopped: the app is `setup` over `home`, which the history lives in. */
  async function paused(withHistory: boolean) {
    const repo = fixtureRepo();
    const first = setup();
    const { session } = await first.starter.startWork(repo, onTicket("02"), "claude-code");
    const home = withHistory
      ? homeWithHistory(session.worktree.path, session.agentSessionId ?? "")
      : mkdtempSync(join(tmpdir(), "dryland-home-"));
    const bin = stubBin();
    return { repo, session, ...setup(bin.dir, { HOME: home, USERPROFILE: home }) };
  }

  it("does not start a second session on a ticket whose resumed one is still running", async () => {
    const { repo, starter, provider } = await paused(true);
    await starter.resumeSession(repo, ticket, "resume");

    await expect(starter.resumeSession(repo, ticket, "resume")).rejects.toBeInstanceOf(DrylandError);
    expect(provider.spawned).toHaveLength(1);
  });

  it("launches the CLI with resume-by-id in the ticket's worktree, hooks injected and nothing typed", async () => {
    const { repo, session: old, provider, starter, hooksDir } = await paused(true);

    const { session, warnings } = await starter.resumeSession(repo, ticket, "resume");

    expect(warnings).toEqual([]);
    expect(session.worktree).toEqual(old.worktree);
    expect(session.agentSessionId).toBe(old.agentSessionId);
    expect(session.command).toBeNull();
    const spawned = provider.spawned[0]?.options;
    expect(spawned?.cwd).toBe(old.worktree.path);
    expect(spawned?.args).toEqual(["--resume", old.agentSessionId, "--settings", join(hooksDir, "claude-code.json")]);
    provider.spawned[0]?.emit("❯ ");
    await pause(80);
    expect(typed(provider.spawned[0])).toBe("");
  });

  it("makes the indexed session live again and leaves the claim as it was", async () => {
    const { repo, session: old, starter } = await paused(true);
    const claimed = grill(repo);
    const before = await readSessionIndex(nodeProcessRunner, repo);

    await starter.resumeSession(repo, ticket, "resume");

    const { index } = await readSessionIndex(nodeProcessRunner, repo);
    expect(index.items["shop/02"]?.map((s) => s.sessionId)).toEqual([old.agentSessionId]);
    expect(Date.parse(index.items["shop/02"]?.[0]?.lastSeen ?? "")).toBeGreaterThanOrEqual(
      Date.parse(before.index.items["shop/02"]?.[0]?.lastSeen ?? ""),
    );
    expect(grill(repo)).toBe(claimed);
  });

  it("opens the CLI's own picker, and says why, when the CLI no longer has the session", async () => {
    const { repo, session: old, provider, starter } = await paused(false);

    const { session, warnings } = await starter.resumeSession(repo, ticket, "resume");

    expect(provider.spawned[0]?.options.args.slice(0, 1)).toEqual(["--resume"]);
    expect(provider.spawned[0]?.options.args).not.toContain(old.agentSessionId);
    expect(provider.spawned[0]?.options.cwd).toBe(old.worktree.path);
    expect(session.agentSessionId).toBeNull();
    expect(warnings).toEqual([expect.stringContaining("no longer has the session")]);
  });

  it("opens the picker directly, without a warning, for Pick another session", async () => {
    const { repo, provider, starter } = await paused(true);

    const { warnings } = await starter.resumeSession(repo, ticket, "pick");

    expect(provider.spawned[0]?.options.args.slice(0, 1)).toEqual(["--resume"]);
    expect(provider.spawned[0]?.options.args[1]).toBe("--settings");
    expect(warnings).toEqual([]);
  });

  it("fails before launching anything when the ticket has no indexed session", async () => {
    const { provider, starter } = setup();

    await expect(starter.resumeSession(fixtureRepo(), ticket, "resume")).rejects.toBeInstanceOf(DrylandError);
    expect(provider.spawned).toEqual([]);
  });

  it("keeps the older session in the index when work starts fresh", async () => {
    const { repo, session: old, starter } = await paused(true);

    installSkill(repo, "implement");

    const { session } = await starter.startWork(repo, onTicket("02"), "claude-code", "implement");

    const { index } = await readSessionIndex(nodeProcessRunner, repo);
    expect(index.items["shop/02"]?.map((s) => s.sessionId)).toEqual([session.agentSessionId, old.agentSessionId]);
    expect(session.agentSessionId).not.toBe(old.agentSessionId);
    expect(session.command).toBe("/implement shop/02");
  });
});

describe("sessions started by hand in a terminal", () => {
  const byHand = (pane: string, cwd: string, session = "by-hand-1") => ({
    session_id: session,
    kind: "session.started" as const,
    timestamp: "2026-10-19T12:00:00.000Z",
    agent: "claude-code",
    cwd,
    pane,
  });

  it("opens a plain terminal that knows its pane and where Dryland keeps the status hooks", () => {
    const { provider, starter, hooksDir } = setup();

    const terminalId = starter.openShell("/repo");

    const options = provider.spawned[0]?.options;
    expect(options).toMatchObject({ file: "/bin/fake-sh", cwd: "/repo" });
    expect(options?.env).toMatchObject({ DRYLAND_PANE_KEY: terminalId, DRYLAND_HOOKS_DIR: hooksDir });
    expect(options?.env.PATH?.split(delimiter)[0]).toBe("/opt/dryland/bin");
    expect(options?.env).not.toHaveProperty("DRYLAND_SESSION_ID");
  });

  it("links a CLI started anywhere inside a ticket's worktree to that ticket", async () => {
    const repo = fixtureRepo();
    const { starter } = setup();
    const { session: started } = await starter.startWork(repo, onTicket("02"), "claude-code");
    const shell = starter.openShell(repo);
    const inside = join(started.worktree.path, ".scratch", "shop");

    const adopted = await starter.adoptManual(repo, byHand(shell, inside));

    expect(adopted).toMatchObject({
      id: "by-hand-1",
      terminalId: shell,
      manual: true,
      project: repo,
      agent: { id: "claude-code" },
      ticket: { map: "shop", id: "02" },
      map: "shop",
      worktree: { branch: "shop/02-grill", path: started.worktree.path },
    });
    expect(starter.sessions()).toContainEqual(adopted);
  });

  it("leaves a CLI started in a directory Dryland did not create unlinked", async () => {
    const repo = fixtureRepo();
    const { starter } = setup();
    const shell = starter.openShell(repo);

    const adopted = await starter.adoptManual(repo, byHand(shell, repo));

    expect(adopted).toMatchObject({ manual: true, ticket: null, map: null });
  });

  it("takes a CLI in a scratch worktree as scratch work, with no ticket and no map", async () => {
    const repo = fixtureRepo();
    const { starter } = setup();
    const { session: scratch } = await starter.startWork(repo, { kind: "scratch" }, "claude-code");
    const shell = starter.openShell(repo);

    const adopted = await starter.adoptManual(repo, byHand(shell, scratch.worktree.path));

    expect(adopted).toMatchObject({ ticket: null, map: null, worktree: { branch: "scratch/scratch-session" } });
  });

  it("replaces the session a terminal's CLI ended with the next one run in the same terminal", async () => {
    const repo = fixtureRepo();
    const { starter } = setup();
    const shell = starter.openShell(repo);

    await starter.adoptManual(repo, byHand(shell, repo, "first"));
    await starter.adoptManual(repo, byHand(shell, repo, "second"));

    expect(starter.sessions().map((s) => s.id)).toEqual(["second"]);
  });

  it("adopts a session once, and only from a terminal it opened that is still running", async () => {
    const repo = fixtureRepo();
    const { starter } = setup();
    const shell = starter.openShell(repo);

    expect(await starter.adoptManual(repo, byHand("not-a-terminal", repo))).toBeNull();
    expect(await starter.adoptManual(repo, { ...byHand(shell, repo), agent: "no-such-cli" })).toBeNull();
    expect(await starter.adoptManual(repo, byHand(shell, repo))).not.toBeNull();
    expect(await starter.adoptManual(repo, byHand(shell, repo))).toBeNull();
    expect(starter.sessions()).toHaveLength(1);
  });
});

describe("starting work with Copilot CLI", () => {
  /** A PATH directory holding a stub `copilot`, and a Copilot home whose config trusts one folder. */
  function copilotSetup() {
    const dir = mkdtempSync(join(tmpdir(), "dryland-work-copilot-"));
    const copilot = join(dir, windows ? "copilot.exe" : "copilot");
    writeFileSync(copilot, "");
    execFileSync(process.execPath, ["-e", `require("fs").chmodSync(${JSON.stringify(copilot)}, 0o755)`]);
    const home = mkdtempSync(join(tmpdir(), "dryland-copilot-home-"));
    const config = '{\n  "theme": "dark",\n  "trustedFolders": [\n    "/other"\n  ]\n}\n';
    writeFileSync(join(home, "config.json"), config);
    return { ...setup(dir, { COPILOT_HOME: home }), copilot, home, config };
  }

  it("asks first: the user's Copilot config would get Dryland's hook file, and says so once it is installed", async () => {
    const { starter, home } = copilotSetup();

    expect(await starter.pendingUserConfigWrite("copilot-cli")).toContain(join(home, "hooks", "dryland.json"));
    expect(await starter.pendingUserConfigWrite("claude-code")).toBeNull();

    await starter.startWork(fixtureRepo(), onTicket("02"), "copilot-cli");

    expect(await starter.pendingUserConfigWrite("copilot-cli")).toBeNull();
  });

  it("installs the hook file, trusts the new worktree and types the command without submitting it", async () => {
    const { provider, starter, copilot, home, config } = copilotSetup();

    const { session, warnings } = await starter.startWork(fixtureRepo(), onTicket("02"), "copilot-cli");
    expect(warnings).toEqual([]);
    expect(existsSync(join(home, "hooks", "dryland.json"))).toBe(true);
    const saved = JSON.parse(readFileSync(join(home, "config.json"), "utf8")) as Record<string, unknown>;
    expect(saved["theme"]).toBe("dark");
    expect(saved["trustedFolders"]).toContain(realpathSync.native(session.worktree.path));
    expect(readFileSync(join(home, "config.json"), "utf8")).toContain(config.slice(0, config.indexOf("/other")));
    const spawned = provider.spawned[0];
    expect(spawned?.options.file).toBe(copilot);
    expect(spawned?.options.args).toEqual(["--session-id", session.agentSessionId]);
    spawned?.emit("GitHub Copilot\r\n> ");
    await vi.waitFor(() => expect(typed(spawned)).toBe("/implement shop/02"));
    expect(typed(spawned)).not.toContain("\r");
  });

  it("starts anyway, with a warning, when the config cannot be trusted into", async () => {
    const { starter, home } = copilotSetup();
    writeFileSync(join(home, "config.json"), "{ not json");

    const { warnings } = await starter.startWork(fixtureRepo(), onTicket("02"), "copilot-cli");

    expect(warnings.join(" ")).toContain("not valid JSON");
    expect(readFileSync(join(home, "config.json"), "utf8")).toBe("{ not json");
  });
});

describe("best-effort Agent CLIs and auto-submit", () => {
  const withCodex = () => setup(stubBin(["codex", "gemini"]).dir);

  it("lists a best-effort CLI as available when its binary is installed", async () => {
    const { starter } = withCodex();
    const agents = await starter.listAgents();
    expect(agents.filter((a) => a.available).map((a) => a.id)).toEqual(["claude-code", "codex-cli", "gemini-cli"]);
  });

  it("opens it with the command typed in its own syntax, launched with no hooks and no session id", async () => {
    const { provider, starter, hooksDir } = withCodex();
    const { session } = await starter.startWork(fixtureRepo(), onTicket("02"), "codex-cli");
    const pty = provider.spawned[0];

    expect(pty?.options.args).toEqual([]);
    expect(session.agentSessionId).toBeNull();
    expect(session.statusApproximate).toBe(true);
    expect(existsSync(join(hooksDir, "codex-cli.json"))).toBe(false);
    pty?.emit("› Ask Codex");
    await vi.waitFor(() => expect(typed(pty)).toBe("$implement shop/02"));
    await pause(50);
    expect(typed(pty)).not.toContain("\r");
  });

  it("marks a hooked CLI's status as exact", async () => {
    const { session } = await withCodex().starter.startWork(fixtureRepo(), onTicket("02"), "claude-code");
    expect(session.statusApproximate).toBeUndefined();
  });

  it("submits the command when auto-submit is on", async () => {
    const { provider, starter } = setup(stubBin(["codex"]).dir, {}, true, true);
    await starter.startWork(fixtureRepo(), onTicket("02"), "codex-cli");
    const pty = provider.spawned[0];
    pty?.emit("› ");
    await vi.waitFor(() => expect(typed(pty)).toBe("$implement shop/02\r"));
  });

  it("asks the auto-submit setting for the project the session starts in", async () => {
    const repo = fixtureRepo();
    const asked: string[] = [];
    const { provider, starter } = setup(undefined, {}, true, true, (project) => {
      asked.push(project);
      return false;
    });
    await starter.startWork(repo, onTicket("02"), "claude-code");
    provider.spawned[0]?.emit("❯ ");
    await pause(80);
    expect(asked).toEqual([repo]);
    expect(typed(provider.spawned[0])).toBe("/implement shop/02");
  });

  it("types nothing, and submits nothing, when the user typed before pre-typing started", async () => {
    const { provider, starter } = setup(undefined, {}, true, true);
    const { session } = await starter.startWork(fixtureRepo(), onTicket("02"), "claude-code");
    const pty = provider.spawned[0];

    pty?.emit("❯ ");
    starter.userTyped(session.terminalId, "x");
    await pause(80);

    expect(typed(pty)).toBe("");
  });

  it("does not take a terminal's own replies, such as a cursor report, for the user typing", async () => {
    const { provider, starter } = setup();
    const { session } = await starter.startWork(fixtureRepo(), onTicket("02"), "claude-code");
    const pty = provider.spawned[0];

    pty?.emit("❯ ");
    starter.userTyped(session.terminalId, "\x1b[1;1R");

    await vi.waitFor(() => expect(typed(pty)).toBe("/implement shop/02"));
  });
});
