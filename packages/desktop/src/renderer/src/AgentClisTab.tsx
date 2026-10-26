import type { AgentHooks } from "@dryland/core";
import { useEffect, useState } from "react";
import type { AgentAvailability } from "../../shared/api.ts";
import { describeAgentHooks, type AgentHooksAction } from "../../shared/agent-hooks.ts";

/** What Dryland keeps in the user's own config for a CLI, spelled out for Inspect. */
function HooksInspection({ hooks }: { hooks: AgentHooks }) {
  return (
    <div role="region" aria-label="Inspect Dryland's config entries" className="hooks-inspection">
      <p>
        Hook file <code>{hooks.hookFile}</code>
      </p>
      {hooks.hookFileText === null ? (
        <p className="dim">Not written.</p>
      ) : (
        <pre aria-label="Hook file contents">{hooks.hookFileText}</pre>
      )}
      <p>
        Trusted worktrees in <code>{hooks.config}</code>
      </p>
      {hooks.trusted.length === 0 ? (
        <p className="dim">None of this project's worktrees are listed.</p>
      ) : (
        <ul aria-label="Trusted worktrees">
          {hooks.trusted.map((path) => (
            <li key={path}>
              <code>{path}</code>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The Agent CLIs tab: every adapter and whether it is installed, and for a CLI that keeps its hooks in the user's
 * own config what Dryland put there, with Install, Inspect and Remove.
 */
export function AgentClisTab({
  hooksRevision,
  onHooks,
}: {
  /** Changes whenever the hooks were installed or removed, so the tab reads them again. */
  hooksRevision: number;
  onHooks: (agentId: string, action: AgentHooksAction) => void;
}) {
  const [agents, setAgents] = useState<AgentAvailability[] | null>(null);
  const [hooks, setHooks] = useState<Record<string, AgentHooks>>({});
  const [inspecting, setInspecting] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void (async () => {
      const list = await window.dryland.listAgents();
      const read = await Promise.all(
        list.map(async (agent) => [agent.id, await window.dryland.agentHooks(agent.id)] as const),
      );
      if (!current) return;
      setAgents(list);
      setHooks(Object.fromEntries(read.filter((entry): entry is [string, AgentHooks] => entry[1] !== null)));
    })();
    return () => {
      current = false;
    };
  }, [hooksRevision]);

  return (
    <>
      <ul className="agent-clis" aria-label="Agent CLIs">
        {agents === null && <li className="dim">Looking for Agent CLIs...</li>}
        {agents?.map((agent) => {
          const own = hooks[agent.id];
          return (
            <li key={agent.id} aria-label={agent.name}>
              <strong>{agent.name}</strong>{" "}
              <span className={agent.available ? undefined : "dim"}>
                {agent.available ? "Installed" : `Not installed: ${agent.reason}`}
              </span>
              {own !== undefined && (
                <div className="agent-hooks">
                  <span>{describeAgentHooks(own)}</span>{" "}
                  <button aria-label={`Install hooks for ${agent.name}`} onClick={() => onHooks(agent.id, "install")}>
                    {own.status === "missing" ? "Install" : "Reinstall"}
                  </button>{" "}
                  <button
                    aria-label={`Inspect hooks for ${agent.name}`}
                    aria-expanded={inspecting === agent.id}
                    onClick={() => setInspecting(inspecting === agent.id ? null : agent.id)}
                  >
                    Inspect
                  </button>{" "}
                  <button
                    aria-label={`Remove hooks for ${agent.name}`}
                    disabled={own.status === "missing" && own.trusted.length === 0}
                    onClick={() => onHooks(agent.id, "remove")}
                  >
                    Remove
                  </button>
                  {inspecting === agent.id && <HooksInspection hooks={own} />}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
