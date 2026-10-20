import type { Compatibility, SkillSetupReport } from "@dryland/core";
import { featureRows, summarizeSkillSetup } from "../../shared/skill-setup.ts";
import { StartWork, type StartHandler } from "./StartWork.tsx";

const VERDICT_LABELS = { ok: "OK", degraded: "Degraded", broken: "Broken" } as const;

/**
 * The Skills tab: the project's Skill setup state and deviations, the Compatibility verdict of every feature with
 * its reason, an override switch for each broken rule, the accepted deviations with a way to revoke them, and Run check.
 */
export function SkillsTab({
  skillSetup,
  onRunCheck,
  onRevoke,
}: {
  /** The open project's setup and verdict; `null` when no project is open or it cannot be read. */
  skillSetup: { report: SkillSetupReport; compatibility: Compatibility } | null;
  onRunCheck: StartHandler;
  onRevoke: () => void;
}) {
  if (skillSetup === null) return <p className="dim">Open a project to see its skill setup.</p>;
  const { report, compatibility } = skillSetup;
  const { label, lines } = summarizeSkillSetup(report);
  const rows = featureRows(compatibility);
  return (
    <>
      <h3>{label}</h3>
      {lines.length > 0 && (
        <ul aria-label="Deviations">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {report.state === "modified" && (
        <>
          <h3>Compatibility</h3>
          {compatibility.note !== null && <p role="status">{compatibility.note}</p>}
          {rows.length === 0 ? (
            <p className="dim">No verdict for this setup yet.</p>
          ) : (
            <ul aria-label="Compatibility verdict">
              {rows.map((row) => (
                <li key={row.id} aria-label={row.id}>
                  <code>{row.id}</code> <span>{VERDICT_LABELS[row.verdict]}</span>
                  {row.reason !== null && <span className="dim">: {row.reason}</span>}
                  {row.verdict === "broken" && (
                    <>
                      {" "}
                      <label>
                        <input
                          type="checkbox"
                          checked={row.overridden}
                          onChange={(event) => void window.dryland.overrideRule(row.id, event.target.checked)}
                        />
                        Override: keep this rule on
                      </label>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          {compatibility.accepted ? (
            <p role="status">
              Deviations accepted. <button onClick={onRevoke}>Revoke</button>
            </p>
          ) : (
            <p className="dim">The deviations are not accepted.</p>
          )}
        </>
      )}
      <StartWork onStart={onRunCheck} label={(agent) => `Run check with ${agent}`} />
    </>
  );
}
