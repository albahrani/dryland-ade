import { ABOUT } from "../../shared/about.ts";

/** The About dialog: what Dryland is, and that it is unofficial and credits Matt Pocock's skills. */
export function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-label={`About ${ABOUT.name}`}>
        <h2>{ABOUT.name}</h2>
        <p>{ABOUT.tagline}</p>
        <p>{ABOUT.credit}</p>
        <p className="dim">{ABOUT.licence}</p>
        <div className="modal-actions">
          <button className="primary" autoFocus onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
