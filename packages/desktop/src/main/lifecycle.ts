import type { SessionState, TicketRef } from "@dryland/core";
import type { QuitListing, StepState } from "../shared/quit.ts";
import { SESSION_META } from "../shared/session-meta.ts";
import { sessionTitle } from "../shared/work-target.ts";

/**
 * The hard budget of an OS-forced shutdown; Windows kills an unresponsive app about 5 seconds in (ADR 0004). A quit
 * the user starts has none: it shows its progress and offers "Quit now".
 */
export const SHUTDOWN_BUDGET_MS = 2000;

/** How long the window has to answer a quit request before the native message box asks instead. */
export const QUIT_ANSWER_MS = 2000;

/**
 * Whether the window shows the quit question (`"in-app"`) or, as it did not acknowledge the request within `waitMs`,
 * the native message box has to ask (`"native"`). Quitting never depends on a healthy renderer.
 */
export async function whoAsks(acknowledged: Promise<void>, waitMs = QUIT_ANSWER_MS): Promise<"in-app" | "native"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const silence = new Promise<"native">((resolve) => (timer = setTimeout(() => resolve("native"), waitMs)));
  try {
    return await Promise.race([acknowledged.then(() => "in-app" as const), silence]);
  } finally {
    clearTimeout(timer);
  }
}

/** One step of shutdown. Nothing in it writes to the tracker or reaches the network (ADR 0010). */
export interface ShutdownStep {
  name: string;
  run(): void | Promise<void>;
}

/** What shutdown got through: steps that finished or failed, and those dropped when the budget ran out. */
export interface ShutdownReport {
  completed: string[];
  failed: string[];
  abandoned: string[];
}

/** Reports and steers a shutdown: `onStep` hears each step's progress, `abandon` ends it at once. */
export interface ShutdownHooks {
  onStep?: (step: string, state: StepState) => void;
  abandon?: AbortSignal;
}

/**
 * Runs `steps` in order within `budgetMs`, or without a deadline when it is `null`. A step that is still running
 * when the budget runs out, or when `hooks.abandon` fires, is abandoned with every step after it; one that fails is
 * reported and the next one runs. The first step starts before this returns, so a synchronous step such as killing
 * the PTYs happens even if the process is killed right after.
 */
export async function runShutdown(
  steps: readonly ShutdownStep[],
  budgetMs: number | null = SHUTDOWN_BUDGET_MS,
  hooks: ShutdownHooks = {},
): Promise<ShutdownReport> {
  const report: ShutdownReport = { completed: [], failed: [], abandoned: [] };
  const { onStep, abandon } = hooks;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbandon: (() => void) | undefined;
  const outOfTime = new Promise<"timeout">((resolve) => {
    if (budgetMs !== null) timer = setTimeout(() => resolve("timeout"), budgetMs);
    onAbandon = () => resolve("timeout");
    if (abandon?.aborted) resolve("timeout");
    else abandon?.addEventListener("abort", onAbandon, { once: true });
  });
  for (const step of steps) onStep?.(step.name, "pending");
  try {
    for (const [index, step] of steps.entries()) {
      let outcome: "done" | "failed" | "timeout";
      if (abandon?.aborted) {
        report.abandoned.push(...steps.slice(index).map((s) => s.name));
        steps.slice(index).forEach((s) => onStep?.(s.name, "abandoned"));
        break;
      }
      onStep?.(step.name, "running");
      try {
        const running = step.run();
        outcome = !(running instanceof Promise)
          ? "done"
          : await Promise.race([
              running.then(
                () => "done" as const,
                () => "failed" as const,
              ),
              outOfTime,
            ]);
      } catch {
        outcome = "failed";
      }
      if (outcome === "timeout") {
        report.abandoned.push(...steps.slice(index).map((s) => s.name));
        steps.slice(index).forEach((s) => onStep?.(s.name, "abandoned"));
        break;
      }
      (outcome === "done" ? report.completed : report.failed).push(step.name);
      onStep?.(step.name, outcome);
    }
  } finally {
    clearTimeout(timer);
    if (onAbandon !== undefined) abandon?.removeEventListener("abort", onAbandon);
  }
  return report;
}

/**
 * The steps of quit and shutdown, in order: kill every PTY, so no process outlives the app (ADR 0002), then flush
 * what the app holds in memory, such as the session index.
 */
export function shutdownSteps(terminals: { closeAll(): void }, flushes: readonly ShutdownStep[] = []): ShutdownStep[] {
  return [{ name: "kill PTYs", run: () => terminals.closeAll() }, ...flushes];
}

/** A session as quitting sees it: what it works on and where. */
export interface QuitSession {
  id: string;
  agent: { name: string };
  ticket: TicketRef | null;
  map: string | null;
  worktree: { branch: string };
}

/** The native message box asking whether to quit. */
export interface QuitConfirmation {
  message: string;
  detail: string;
  buttons: [quit: string, cancel: string];
}

/**
 * The sessions quitting would stop, every one of them, hidden or not: those waiting on the user first, then those
 * with output the user has not seen. Empty when none runs, so the app quits without asking.
 */
export function quitListing(
  live: readonly QuitSession[],
  states: Readonly<Record<string, SessionState>>,
  unseen: ReadonlySet<string> = new Set(),
): QuitListing[] {
  // A CLI that reported its session's end has nothing left to lose, even while its process winds down.
  const state = (session: QuitSession) => states[session.id] ?? "launched";
  const rank = (session: QuitSession) =>
    state(session) === "waiting" ? 0 : unseen.has(session.id) ? 1 : 2 + SESSION_META[state(session)].urgency;
  return live
    .filter((session) => states[session.id] !== "ended")
    .sort((a, b) => rank(a) - rank(b))
    .map((session) => ({
      id: session.id,
      title: sessionTitle(session),
      agent: session.agent.name,
      branch: session.worktree.branch,
      state: state(session),
      unseen: unseen.has(session.id),
    }));
}

/** The native message box for a quit the window cannot ask about, listing `quitListing`'s sessions. */
export function quitConfirmation(listing: readonly QuitListing[]): QuitConfirmation | null {
  if (listing.length === 0) return null;
  const lines = listing.map((session) => {
    const label = SESSION_META[session.state].label + (session.unseen ? ", unseen output" : "");
    return `• ${session.title} (${label}) in ${session.branch}`;
  });
  const count = listing.length === 1 ? "1 session is" : `${listing.length} sessions are`;
  return {
    message: `${count} still running. Quit Dryland and stop ${listing.length === 1 ? "it" : "them"}?`,
    detail: `${lines.join("\n")}\n\nClaims are kept, and the Agent CLI keeps each session so it can be resumed.`,
    buttons: ["Quit", "Cancel"],
  };
}
