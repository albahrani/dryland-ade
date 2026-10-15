import type { NextUpMarker } from "@dryland/core";

/** The Next-up marker's star; hovering it shows the one-sentence "why this next". */
export function NextUpStar({ marker }: { marker: NextUpMarker }) {
  return (
    <span className="next-up-star" title={marker.step.reason} role="img" aria-label={`Next up: ${marker.step.reason}`}>
      ★
    </span>
  );
}

/** The full explanation of a marker: rule, command, reason, and each fact read with its artifact and field. */
export function NextUpExplanation({ marker }: { marker: NextUpMarker }) {
  const { ruleId, command, reason, evidence } = marker.step;
  return (
    <section className="next-up-explanation" aria-label="Why this next">
      <h3>★ Next up</h3>
      <p>{reason}</p>
      <dl>
        <div>
          <dt>Rule</dt>
          <dd>{ruleId}</dd>
        </div>
        <div>
          <dt>Command</dt>
          <dd>{command ?? "none"}</dd>
        </div>
      </dl>
      <table aria-label="Evidence">
        <thead>
          <tr>
            <th>Artifact</th>
            <th>Field</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {evidence.map((fact, i) => (
            <tr key={i}>
              <td>{fact.artifact}</td>
              <td>{fact.field}</td>
              <td>{fact.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
