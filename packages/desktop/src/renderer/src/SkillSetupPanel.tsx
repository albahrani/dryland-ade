import type { Compatibility, SkillSetupReport } from "@dryland/core";
import { summarizeSkillSetup } from "../../shared/skill-setup.ts";

/** A feature the Compatibility verdict does not call fine: why, and for a broken one how to turn it back on. */
function FeatureLine({ feature }: { feature: Compatibility["features"][number] }) {
  const reason = feature.reason === null ? "" : `: ${feature.reason}`;
  if (feature.verdict === "degraded") return <li>{`${feature.id} works with a warning${reason}`}</li>;
  return (
    <li>
      {feature.disabled ? `${feature.id} is disabled${reason}` : `${feature.id} is broken but turned on${reason}`}{" "}
      <button onClick={() => void window.dryland.overrideRule(feature.id, feature.disabled)}>
        {feature.disabled ? "Turn on" : "Turn off"}
      </button>
    </li>
  );
}

/**
 * The project's Skill setup state: a banner when the repo is not set up, else the state, with its deviations or
 * extras a click away so that a long list does not push the views down. The Compatibility verdict's degraded and
 * broken features, and a note when the verdict file is unusable, are listed with them.
 */
export function SkillSetupPanel({ report, compatibility }: { report: SkillSetupReport; compatibility: Compatibility }) {
  const { label, tone, lines, command } = summarizeSkillSetup(report);
  const list = (
    <ul>
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
      {compatibility.features.map((feature) => (
        <FeatureLine key={feature.id} feature={feature} />
      ))}
      {compatibility.note !== null && <li>{compatibility.note}</li>}
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
  const detailed = lines.length > 0 || compatibility.features.length > 0 || compatibility.note !== null;
  return (
    <section className={`skill-setup skill-setup-${tone}`} aria-label="Skill setup" role="status">
      {detailed ? (
        <details>
          <summary>{label}</summary>
          {list}
        </details>
      ) : (
        <h3>{label}</h3>
      )}
    </section>
  );
}
