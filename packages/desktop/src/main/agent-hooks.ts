import {
  AGENT_ADAPTERS,
  installAgentHooks,
  readAgentHooks,
  removeAgentHooks,
  type AgentHooks,
  type ProcessRunner,
} from "@dryland/core";
import type { AgentHooksChange, AgentHooksAction } from "../shared/agent-hooks.ts";

export interface AgentHooksControlOptions {
  runner: ProcessRunner;
  /** The environment the Agent CLIs read their config location from. */
  env: Record<string, string | undefined>;
  /** The user's home as the CLIs read it; `undefined` for the operating system's. */
  home: string | undefined;
}

export interface AgentHooksControl {
  /**
   * What Dryland keeps in the user's own config for the Agent CLI, for `projectPath`'s worktrees (`null` for no
   * project); `null` when the CLI keeps its hooks elsewhere, with nothing in the user's config to show.
   */
  read(agentId: string, projectPath: string | null): Promise<AgentHooks | null>;
  /** Does what `dryland doctor --install-hooks` or `--remove-hooks` does; `null` for a CLI with no user config. */
  change(agentId: string, projectPath: string | null, action: AgentHooksAction): Promise<AgentHooksChange | null>;
}

export function createAgentHooksControl({ runner, env, home }: AgentHooksControlOptions): AgentHooksControl {
  const options = { env, home };
  const keepsUserConfig = (agentId: string) =>
    AGENT_ADAPTERS.some((adapter) => adapter.id === agentId && adapter.hookInjection.kind === "user-config");
  return {
    async read(agentId, projectPath) {
      return keepsUserConfig(agentId) ? readAgentHooks(runner, projectPath, options) : null;
    },
    async change(agentId, projectPath, action) {
      if (!keepsUserConfig(agentId)) return null;
      const done =
        action === "install"
          ? await installAgentHooks(runner, projectPath, options)
          : await removeAgentHooks(runner, projectPath, options);
      return { hooks: await readAgentHooks(runner, projectPath, options), ...done };
    },
  };
}
