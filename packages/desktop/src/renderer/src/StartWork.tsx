import { useEffect, useState } from "react";
import type { AgentAvailability } from "../../shared/api.ts";

/** Picks an Agent CLI and starts work on the ticket with it. CLIs that are not installed are shown, disabled. */
export function StartWork({ onStart }: { onStart: (agentId: string) => Promise<void> }) {
  const [agents, setAgents] = useState<AgentAvailability[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let current = true;
    void window.dryland.listAgents().then((list) => {
      if (!current) return;
      setAgents(list);
      setChosen(list.find((agent) => agent.available)?.id ?? list[0]?.id ?? null);
    });
    return () => {
      current = false;
    };
  }, []);

  if (agents === null || agents.length === 0) return null;
  const agent = agents.find((a) => a.id === chosen) ?? agents[0];
  if (agent === undefined) return null;
  const start = async () => {
    setStarting(true);
    try {
      await onStart(agent.id);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="start-work" role="group" aria-label="Start work">
      {agents.length > 1 && (
        <select aria-label="Agent CLI" value={agent.id} onChange={(event) => setChosen(event.target.value)}>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.available ? a.name : `${a.name} (unavailable)`}
            </option>
          ))}
        </select>
      )}
      <button disabled={!agent.available || starting} onClick={() => void start()}>
        Start with {agent.name}
      </button>
      {!agent.available && (
        <span className="unavailable">
          {agent.name} is unavailable: {agent.reason}
        </span>
      )}
    </div>
  );
}
