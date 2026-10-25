# Live state reporting: improve, shrink or cut

Type: grilling
Status: resolved
Blocked by: 04

## Question

Given what the UI actually gets and what non-UI parts need, decide whether to improve the UI part of live state reporting, shrink it, or remove it while keeping the reporting that hooks, session status, claims and the rule engine rely on.

## Answer

Decision: cut the UI part, keep and shrink the session-state part. Cut: live-events panel (toggle, setting, persisted mode, IPC, e2e), ticket.changed and the changed hook, lock file (env-only discovery), hand-started adoption fields (agent, cwd, pane; link only via a claim), session.started, output-guessing fallback and statusApproximate. Keep: a session-only channel with fixed states (running, waiting, idle, ended), schema of session id, state, timestamp, no payload, unknown states rejected; sent by Claude Code and Copilot hooks; feeds badges, waiting counts, waiting-first ranking and lastState in the session index; missing hooks are a doctor error. Agent writes reaching the app depend on the storage design (fog). Spec should update the GLOSSARY Live event entry to mean a session state report.
