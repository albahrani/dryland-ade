import { join } from "node:path";
import { DrylandError, findMainCheckout, type ProcessRunner, readTrackerKind } from "@dryland/core";

export interface TrackerWidgetActionDeps {
  runner: ProcessRunner;
  /** The open project's path; `null` when none is open. */
  projectPath: string | null;
  /** Opens a path in the file manager. Resolves to an error message, or `""` on success (Electron's `shell.openPath`). */
  openPath(path: string): Promise<string>;
}

/**
 * Runs an action of the menu bar's tracker widget in the project's main checkout: `reveal-issues` shows the local
 * issues folder, `open-issues` opens the forge's issue list in the browser. Resolves to an error message, or `null`
 * when it worked or there was nothing to do.
 */
export async function runTrackerWidgetAction(kind: unknown, deps: TrackerWidgetActionDeps): Promise<string | null> {
  if (deps.projectPath === null || (kind !== "reveal-issues" && kind !== "open-issues")) return null;
  let mainCheckout: string;
  try {
    mainCheckout = await findMainCheckout(deps.runner, deps.projectPath);
  } catch (error) {
    if (error instanceof DrylandError) return null;
    throw error;
  }
  if (kind === "reveal-issues") {
    const error = await deps.openPath(join(mainCheckout, ".scratch"));
    return error === "" ? null : error;
  }
  const tracker = await readTrackerKind(mainCheckout).catch((error: unknown) => {
    if (error instanceof DrylandError) return null;
    throw error;
  });
  if (tracker !== "github" && tracker !== "gitlab") return null;
  const cli = tracker === "github" ? "gh" : "glab";
  const result = await deps.runner.run(cli, ["issue", "list", "--web"], { cwd: mainCheckout });
  return result.exitCode === 0 ? null : `${cli} issue list --web failed: ${result.stderr.trim()}`;
}
