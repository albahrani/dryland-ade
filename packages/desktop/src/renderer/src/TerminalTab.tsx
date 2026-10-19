import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";
import { getOrCreateTerminal } from "./terminals.ts";

/** Shows terminal `id`. Stays mounted while hidden so the terminal is not rebuilt on tab switches. */
export function TerminalTab({ id, active }: { id: string; active: boolean }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = container.current;
    if (element === null) return;
    const { term, fit } = getOrCreateTerminal(id);
    // A terminal opens once; its view moves back in when the tab is shown again after another project was shown.
    if (term.element === undefined) term.open(element);
    else element.appendChild(term.element);
    // A hidden tab has no size to fit to; it refits when it is shown again.
    const refit = () => {
      if (element.offsetWidth > 0 && element.offsetHeight > 0) fit.fit();
    };
    refit();
    const observer = new ResizeObserver(refit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [id]);

  useEffect(() => {
    if (active) getOrCreateTerminal(id).term.focus();
  }, [id, active]);

  return <div ref={container} className="terminal" role="tabpanel" aria-label="Terminal" hidden={!active} />;
}
