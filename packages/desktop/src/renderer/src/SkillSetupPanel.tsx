import type { SkillSetupReport } from "@dryland/core";
import { summarizeSkillSetup } from "../../shared/skill-setup.ts";

/**
 * The project's Skill setup state: a banner when the repo is not set up, else the state, with its deviations or
 * extras a click away so that a long list does not push the views down.
 */
export function SkillSetupPanel({ report }: { report: SkillSetupReport }) {
  const { label, tone, lines, command } = summarizeSkillSetup(report);
  const list = (
    <ul>
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
  if (tone === "banner")
    return (
      <section className="skill-setup skill-setup-banner" aria-label="Skill setup" role="alert">
        <h3>{label}</h3>
        {list}
        <p>
          Next step: run <code>{command}</code>.
        </p>
      </section>
    );
  return (
    <section className={`skill-setup skill-setup-${tone}`} aria-label="Skill setup" role="status">
      {lines.length === 0 ? (
        <h3>{label}</h3>
      ) : (
        <details>
          <summary>{label}</summary>
          {list}
        </details>
      )}
    </section>
  );
}
