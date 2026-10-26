# ADRs superseded and spec and glossary consequences

Type: grilling
Status: resolved
Blocked by: 11

## Question

List which of ADRs 0001 to 0004 and later ones the rework supersedes in whole or part, and what the spec and glossary must carry as a result, including dropping the best-effort agent tier and the adapter cleanup it implies. Decide the ADR set to write; do not write it.

## Answer

Decision: five new ADRs, header notes on old ones, body untouched. New: (1) engine owns structured state, agents supply prose (ticket parts, revisions, caps, gates, unslop); (2) event log on a dedicated git ref with optional state remote, forges as reporting channels; (3) isolation ladder and access requests; (4) prompts derive from a pinned upstream snapshot through overlays, with overrides; (5) CLI surface and session-state channel. Superseded in whole: 0001 (CLI stays sole write path, over the store; backends and pathspec commits go), 0003 (annotations, fingerprinting, compat verdict go; consent flags survive for 0005), 0008 (model, local-markdown format, backends, lock file, ticket.changed), 0009 (claims become events). Amended: 0004 (tests bullet), 0005 (other-CLIs bullet), 0006 (best-effort tier, auto-submit, PTY fallback, session.started, statusApproximate dropped), 0007 (snapshot from store, routing from prompt set, migrate/init replaces setup rule), 0010 (claim holder and stale-claim wording). 0002 stays, one stale wording. Adapter cleanup needs no ticket: amendment note on 0006 plus a spec line. Migration and UX go in the spec only. Lens mode is dropped; skills-only repos migrate. Glossary: remove Best-effort tier, Approximate status, Auto-submit, Skill setup state, Compatibility verdict, ADE-owned annotation, ADE tracker, Hand-started session; redefine Live event, Ticket, Map, Fog item, Claim, Stale claim, Amend, Skill workflow; add Report, Analysis log, Description, Solution summary, Revision, Author kind, Reopen, Unslop, Suggest. Spec: new .scratch/dryland-rework/spec.md listing the old stories and sections it replaces (lens mode, compat checks, live-events panel, best-effort CLIs). Limits: ADR wording and numbering left to the writing.
