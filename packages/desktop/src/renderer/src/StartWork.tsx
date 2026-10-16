import { useEffect, useState } from "react";
import type { AgentAvailability } from "../../shared/api.ts";

/** Starts a session with the chosen Agent CLI, and with `skill` instead of the recommended command when given. */
export type StartHandler = (agentId: string, skill: string | null) => Promise<void>;

/**
 * Picks an Agent CLI and starts a session with it. CLIs that are not installed are shown, disabled. With
 * `chooseSkill`, the user can also pick any installed skill instead of the recommended command, so Dryland never
 * blocks them.
 */
export function StartWork({
  onStart,
  label = (agent) => `Start with ${agent}`,
  chooseSkill = false,
}: {
  onStart: StartHandler;
  /** The button's text, given the agent's name. */
  label?: (agent: string) => string;
  chooseSkill?: boolean;
}) {
  const [agents, setAgents] = useState<AgentAvailability[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [skills, setSkills] = useState<string[]>([]);
  // `null` is the recommended command.
  const [skill, setSkill] = useState<string | null>(null);
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

  useEffect(() => {
    if (!chooseSkill || chosen === null) return;
    let current = true;
    void window.dryland.listSkills(chosen).then((list) => {
      if (!current) return;
      setSkills(list);
      setSkill((picked) => (picked !== null && list.includes(picked) ? picked : null));
    });
    return () => {
      current = false;
    };
  }, [chooseSkill, chosen]);

  if (agents === null || agents.length === 0) return null;
  const agent = agents.find((a) => a.id === chosen) ?? agents[0];
  if (agent === undefined) return null;
  const start = async () => {
    setStarting(true);
    try {
      await onStart(agent.id, skill);
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
      {chooseSkill && skills.length > 0 && (
        <select
          aria-label="Skill"
          value={skill ?? ""}
          onChange={(event) => setSkill(event.target.value === "" ? null : event.target.value)}
        >
          <option value="">Recommended command</option>
          {skills.map((name) => (
            <option key={name} value={name}>
              /{name}
            </option>
          ))}
        </select>
      )}
      <button disabled={!agent.available || starting} onClick={() => void start()}>
        {label(agent.name)}
      </button>
      {!agent.available && (
        <span className="unavailable">
          {agent.name} is unavailable: {agent.reason}
        </span>
      )}
    </div>
  );
}
