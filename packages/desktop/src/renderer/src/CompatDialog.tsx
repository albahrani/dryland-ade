import type { SkillSetupReport } from "@dryland/core";
import { StartWork } from "./StartWork.tsx";
import type { StartHandler } from "./StartWork.tsx";

/**
 * Asked once for a modified skill setup nobody has judged: Run check opens a session pre-typed to run the
 * compatibility prompt (clicking it is the consent to launch), Skip carries on without a verdict, and Accept
 * deviations is remembered until the setup changes.
 */
export function CompatDialog({
  report,
  onRunCheck,
  onSkip,
  onAccept,
}: {
  report: SkillSetupReport;
  onRunCheck: StartHandler;
  onSkip: () => void;
  onAccept: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Modified skill setup">
        <h2>This skill setup differs from the default</h2>
        <p>Dryland may recommend skills that no longer fit. Its deviations:</p>
        <ul aria-label="Deviations">
          {report.deviations.map((deviation) => (
            <li key={deviation.detail}>{deviation.detail}</li>
          ))}
        </ul>
        <p>
          Run check has an Agent CLI judge which Dryland features still work and write the verdict to{" "}
          <code>.dryland/compat.md</code>. Skip recommends only skills that are installed.
        </p>
        <StartWork onStart={onRunCheck} label={(agent) => `Run check with ${agent}`} />
        <div className="modal-actions">
          <button onClick={onSkip}>Skip</button>
          <button onClick={onAccept}>Accept deviations</button>
        </div>
      </div>
    </div>
  );
}
