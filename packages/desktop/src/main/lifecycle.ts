import type { SessionState, TicketRef } from "@dryland/core";
import { SESSION_META } from "../shared/session-meta.ts";
import { sessionTitle } from "../shared/work-target.ts";

/** Quit and system shutdown share one hard budget; Windows kills an unresponsive app about 5 seconds in (ADR 0004). */
export const SHUTDOWN_BUDGET_MS = 2000;

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

/**
 * Runs `steps` in order within `budgetMs`. A step that is still running when the budget runs out is abandoned with
 * every step after it; one that fails is reported and the next one runs. The first step starts before this returns,
 * so a synchronous step such as killing the PTYs happens even if the process is killed right after.
 */
export async function runShutdown(
  steps: readonly ShutdownStep[],
  budgetMs = SHUTDOWN_BUDGET_MS,
): Promise<ShutdownReport> {
  const report: ShutdownReport = { completed: [], failed: [], abandoned: [] };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const outOfTime = new Promise<"timeout">((resolve) => (timer = setTimeout(() => resolve("timeout"), budgetMs)));
  try {
    for (const [index, step] of steps.entries()) {
      let outcome: "done" | "failed" | "timeout";
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
        break;
      }
      (outcome === "done" ? report.completed : report.failed).push(step.name);
    }
  } finally {
    clearTimeout(timer);
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
 * Asks before quitting when sessions still run, listing every one of them, tab or not, those waiting on the user
 * first. `null` when none runs, so the app quits without asking.
 */
export function quitConfirmation(
  live: readonly QuitSession[],
  states: Readonly<Record<string, SessionState>>,
): QuitConfirmation | null {
  // A CLI that reported its session's end has nothing left to lose, even while its process winds down.
  const running = live.filter((session) => states[session.id] !== "ended");
  if (running.length === 0) return null;
  const urgency = (session: QuitSession) => SESSION_META[states[session.id] ?? "launched"].urgency;
  const listed = running.sort((a, b) => urgency(a) - urgency(b));
  const lines = listed.map((session) => {
    const state = SESSION_META[states[session.id] ?? "launched"].label;
    return `• ${sessionTitle(session)} (${state}) in ${session.worktree.branch}`;
  });
  const count = listed.length === 1 ? "1 session is" : `${listed.length} sessions are`;
  return {
    message: `${count} still running. Quit Dryland and stop ${listed.length === 1 ? "it" : "them"}?`,
    detail: `${lines.join("\n")}\n\nClaims are kept, and the Agent CLI keeps each session so it can be resumed.`,
    buttons: ["Quit", "Cancel"],
  };
}
