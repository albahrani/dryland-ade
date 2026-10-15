import type { SessionSnapshot } from "./next-step.ts";

export type SessionState = SessionSnapshot["state"];

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
   * How the skill command reaches the CLI. `pre-type` types it into the interactive prompt without Enter, once
   * the CLI has drawn its prompt; v1 has no other mode, because prompt arguments submit immediately.
   */
  initialPrompt: "pre-type";
  /**
   * Screens that swallow or misread keystrokes, such as a folder trust dialog: nothing is typed while the
   * latest output shows one. Matched against the output with escape sequences and whitespace removed.
   */
  blockingPrompts: readonly RegExp[];
  /** How status hooks reach the CLI; acted on by the session status tickets. */
  hookInjection: { kind: "settings-flag"; flag: string } | { kind: "user-config" } | { kind: "none" };
  /**
   * Native hook event to session state, `Event` or `Event:subtype`. "launched" always comes from Dryland's
   * own spawn and is not listed.
   */
  statusEvents: Readonly<Record<string, Exclude<SessionState, "launched">>>;
}

/**
 * Claude Code. Launch and the trust dialog are verified against 2.1.300 on Windows (research notes,
 * ticket 33); the API-key and login screens are blocked by their documented wording, not yet seen; the status
 * mapping is from documentation until the status ticket verifies it.
 */
export const CLAUDE_CODE: AgentAdapter = {
  id: "claude-code",
  name: "Claude Code",
  tier: "first-class",
  binary: "claude",
  launchArgs: [],
  skillPrefix: "/",
  initialPrompt: "pre-type",
  blockingPrompts: [/trustthisfolder/i, /usethisapikey/i, /selectloginmethod/i],
  hookInjection: { kind: "settings-flag", flag: "--settings" },
  statusEvents: {
    UserPromptSubmit: "running",
    PreToolUse: "running",
    PostToolUse: "running",
    "Notification:permission_prompt": "waiting",
    "Notification:elicitation_dialog": "waiting",
    PermissionRequest: "waiting",
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
