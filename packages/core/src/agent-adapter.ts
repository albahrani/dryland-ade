import type { LiveEventKind } from "./live-reporting.ts";
import type { LiveSessionSnapshot } from "./next-step.ts";

export type SessionState = LiveSessionSnapshot["state"];

/**
 * An Agent adapter (ADR 0006): the declarative description of one Agent CLI that Dryland launches in a PTY,
 * pre-types a skill command into, and observes. Adding a best-effort CLI is one more entry like this.
 */
export interface AgentAdapter {
  id: string;
  name: string;
  /** First-class CLIs have verified launch and status; best-effort ones get launch and pre-typing only. */
  tier: "first-class" | "best-effort";
  /** The executable, looked up on `PATH`. */
  binary: string;
  /** Arguments of the interactive launch. Never one that submits a prompt, such as `-p`. */
  launchArgs: readonly string[];
  /** How a skill is invoked: the prefix that replaces the `/` of the rule engine's commands. */
  skillPrefix: string;
  /**
   * Where the CLI finds installed skills, relative to the project and to the user's home: one directory per skill,
   * holding its `SKILL.md`. Read only, to offer every installed skill besides the recommended one.
   */
  skillDirs: readonly string[];
  /**
   * How the skill command reaches the CLI. `pre-type` types it into the interactive prompt without Enter, once
   * the CLI has drawn its prompt; v1 has no other mode, because prompt arguments submit immediately.
   */
  initialPrompt: "pre-type";
  /**
   * Screens that swallow or misread keystrokes, such as a folder trust dialog: nothing is typed while the
   * latest output shows one. Matched against the output with escape sequences and whitespace removed.
   */
  blockingPrompts: readonly RegExp[];
  /**
   * Variables a running session of this CLI sets for the processes it starts. They are removed from a session's
   * environment, so that when Dryland itself was started from inside such a session, the CLIs it launches are
   * not taken for that session's children. Settings the user exports are not listed and pass through.
   */
  parentSessionEnv: readonly string[];
  /**
   * The variable holding the CLI's own session id in the processes a session starts, so a `dryland` command run by
   * the agent knows which session acted (ADR 0010); `null` when the CLI sets none.
   */
  sessionEnv: string | null;
  /** The launch flag that sets the CLI's session id, so Dryland knows it from spawn; `null` when the CLI has none. */
  sessionIdFlag: string | null;
  /**
   * The flag that resumes a session: followed by an id it resumes that one, alone it opens the CLI's own picker;
   * `null` when the CLI cannot resume.
   */
  resumeFlag: string | null;
  /** How status hooks reach the CLI; acted on by the session status tickets. */
  hookInjection: { kind: "settings-flag"; flag: string } | { kind: "user-config" } | { kind: "none" };
  /**
   * Native hook event to session state, `Event` or `Event:subtype`. "launched" always comes from Dryland's
   * own spawn and is not listed.
   */
  statusEvents: Readonly<Record<string, Exclude<SessionState, "launched">>>;
}

/**
 * Claude Code. Launch and every blocking dialog listed are verified against 2.1.300 on Windows (research notes,
 * ticket 33), and so are the status hooks injected with `--settings` and their mapping (ticket 36).
 */
export const CLAUDE_CODE: AgentAdapter = {
  id: "claude-code",
  name: "Claude Code",
  tier: "first-class",
  binary: "claude",
  launchArgs: [],
  skillPrefix: "/",
  skillDirs: [".claude/skills"],
  initialPrompt: "pre-type",
  // A CLI that is not logged in opens to its input box and is not blocked.
  blockingPrompts: [/trustthisfolder/i, /choosethetextstyle/i, /allowexternalclaude\.mdfileimports/i, /usethisapikey/i],
  // Seen in a Claude Code 2.1.300 session; CLAUDE_CODE_CHILD_SESSION alone turns the child's transcripts off.
  parentSessionEnv: [
    "CLAUDECODE",
    "CLAUDE_CODE_CHILD_SESSION",
    "CLAUDE_CODE_SESSION_ID",
    "CLAUDE_CODE_SESSION_ATTENDED",
    "CLAUDE_CODE_ENTRYPOINT",
    "CLAUDE_CODE_EXECPATH",
    "CLAUDE_CODE_MESSAGING_SOCKET",
    "CLAUDE_CODE_MESSAGING_TOKEN",
    "CLAUDE_PID",
  ],
  sessionEnv: "CLAUDE_CODE_SESSION_ID",
  // Verified against 2.1.301: hooks see the id given at launch in CLAUDE_CODE_SESSION_ID (ticket 74).
  sessionIdFlag: "--session-id",
  resumeFlag: "--resume",
  hookInjection: { kind: "settings-flag", flag: "--settings" },
  // SessionStart (fires at launch) and SubagentStop (fires after Stop) are left out: neither changes the state.
  // PermissionRequest also fires for AskUserQuestion and ExitPlanMode, in default, plan and auto mode, so their
  // dialogs need no PreToolUse matcher of their own. A cancelled question fires nothing; the next prompt clears it.
  statusEvents: {
    UserPromptSubmit: "running",
    PreToolUse: "running",
    PostToolUse: "running",
    // A tool that fails after its dialog was approved reports no PostToolUse.
    PostToolUseFailure: "running",
    "Notification:permission_prompt": "waiting",
    "Notification:elicitation_dialog": "waiting",
    "Notification:elicitation_url_dialog": "waiting",
    PermissionRequest: "waiting",
    // An MCP server asking for input: at once, where its Notification comes about 6 s later.
    Elicitation: "waiting",
    ElicitationResult: "running",
    Stop: "idle",
    "Notification:idle_prompt": "idle",
    SessionEnd: "ended",
  },
};

/** Every Agent CLI Dryland can start work with, in the order they are offered. */
export const AGENT_ADAPTERS: readonly AgentAdapter[] = [CLAUDE_CODE];

/** A rule engine command, such as `/implement shop/02`, written the way the adapter's CLI invokes skills. */
export function skillCommand(adapter: AgentAdapter, command: string): string {
  return adapter.skillPrefix + command.replace(/^\//, "");
}

/** The launch arguments that give a new session the id `sessionId`; none when the CLI cannot be told one. */
export function sessionIdArgs(adapter: AgentAdapter, sessionId: string): string[] {
  return adapter.sessionIdFlag === null ? [] : [adapter.sessionIdFlag, sessionId];
}

/**
 * The arguments that resume session `sessionId`, or open the CLI's own picker when it is `null`; `null` when the
 * CLI cannot resume.
 */
export function resumeArgs(adapter: AgentAdapter, sessionId: string | null): string[] | null {
  if (adapter.resumeFlag === null) return null;
  return sessionId === null ? [adapter.resumeFlag] : [adapter.resumeFlag, sessionId];
}

/** A Claude Code `hooks` settings entry: command hooks for the events a matcher selects. */
interface HookGroup {
  matcher?: string;
  hooks: { type: "command"; command: string; timeout: number }[];
}

/** The live event kind that reports each session state; launched has none, it comes from Dryland's own spawn. */
export const SESSION_STATE_EVENTS = {
  running: "session.running",
  waiting: "session.waiting",
  idle: "session.idle",
  ended: "session.ended",
} as const satisfies Record<Exclude<SessionState, "launched">, LiveEventKind>;

/** The session state a live event reports, or `null` for one that says nothing about a session's state. */
export function sessionStateOf(kind: LiveEventKind): SessionState | null {
  const found = Object.entries(SESSION_STATE_EVENTS).find(([, eventKind]) => eventKind === kind);
  return found === undefined ? null : (found[0] as SessionState);
}

/**
 * The settings a `settings-flag` adapter's CLI is launched with: for each native event of its `statusEvents`, a
 * hook that reports the session state with `dryland status`. `Event:subtype` becomes a matcher on the subtype.
 */
export function hookSettings(statusEvents: AgentAdapter["statusEvents"]): { hooks: Record<string, HookGroup[]> } {
  const hooks: Record<string, HookGroup[]> = {};
  for (const [event, state] of Object.entries(statusEvents)) {
    const [name = event, subtype] = event.split(":");
    const command = `dryland status ${SESSION_STATE_EVENTS[state]}`;
    // `dryland status` gives up on an app that does not answer well within this; seconds, as Claude Code counts.
    const group: HookGroup = { hooks: [{ type: "command", command, timeout: 5 }] };
    (hooks[name] ??= []).push(subtype === undefined ? group : { matcher: subtype, ...group });
  }
  return { hooks };
}

/** Terminal output as plain text: OSC and CSI sequences, other escapes and all whitespace removed. */
function screenText(output: string): string {
  return output
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-9;?<>=]*[ -/]*[@-~]/g, "")
    .replace(/\x1b./g, "")
    .replace(/\s+/g, "");
}

/** Whether `output` shows one of the adapter's blocking prompts, so a pre-typed command must wait. */
export function blocksInput(adapter: AgentAdapter, output: string): boolean {
  const text = screenText(output);
  return adapter.blockingPrompts.some((prompt) => prompt.test(text));
}
