import type { AgentHooks, HooksResult } from "@dryland/core";

export type AgentHooksAction = "install" | "remove";

/** Whether `value`, which came from the renderer, names an action on the hooks. */
export const isAgentHooksAction = (value: unknown): value is AgentHooksAction =>
  value === "install" || value === "remove";

/** What installing or removing did, with the hooks as they stand after it. */
export interface AgentHooksChange extends HooksResult {
  hooks: AgentHooks;
}

/** The hooks' state in a line: whether the hook file is current and how many of the project's worktrees are trusted. */
export function describeAgentHooks(hooks: AgentHooks): string {
  const file = { installed: "Hook file installed", outdated: "Hook file outdated", missing: "Hook file not installed" }[
    hooks.status
  ];
  if (hooks.worktrees.length === 0) return file;
  return `${file}; ${hooks.trusted.length} of ${hooks.worktrees.length} worktrees trusted`;
}
