# Map: Dryland rework

## Destination

A rework spec plus an ADR set for Dryland: a workflow engine that owns maps, fog, tickets and comments, with agents only running prompts under it. The ADRs supersede the parts of ADRs 0001 to 0004 (and later ones) that no longer hold, and the glossary carries the new language. Reached when every rework decision is in the spec and ADRs, ready for `/to-spec` and `/to-tickets` to slice. Nothing is built during wayfinding.

## Notes

- Domain: the Dryland rework. Earlier decisions live in the closed map `.scratch/mattpocock-ade/map.md`, its ADRs in `docs/adr/`, `GLOSSARY.md` and `docs/agents/issue-tracker.md`.
- Positioning: Dryland stops being a lens over files the skills write and becomes the source of truth for tickets, maps and fog. Its prompts are derived from the unmodified upstream Matt Pocock skills and enriched with Dryland's own ideas. When upstream publishes a new release, adopting it is our decision (the cost of not adopting is a growing gap), and adopting it means a new Dryland release. Skills-only repos get a one-way migration, not ongoing compatibility.
- Constraint (settled): the only Agent CLIs are Claude Code and GitHub Copilot CLI. The best-effort tier (Codex, Gemini, auto-submit) is dropped; removing it is a consequence the spec lists, not a decision to debate.
- Scope boundaries are assumed, not strict; widen or narrow them together as understanding grows.
- Standing preference: keep ticket titles, fog items and answers short and structured. Long, verbose prose is the problem this map is about.
- Skills to consult as ticket types require: `grilling`, `domain-modeling`, `research`, `prototype`.
- Research capture: findings go in `.scratch/dryland-rework/research/<name>.md`, as in the first map. No throwaway branches.
- Tickets and map indexes change through the `dryland` CLI, not by editing files.

## Decisions so far

- [Rules and workflow in the upstream skills](issues/03-rules-and-workflow-in-the-upstream-skills.md): Upstream rules split into a mechanical shell (order, enums, sections, gates) and a judgement core; see research file.
- [What the UI gets from live state reporting](issues/04-what-the-ui-gets-from-live-state-reporting.md): Live events feed only session badges, the events panel and instant refresh; core flows do not need them.
- [GitHub and GitLab structured-data capabilities](issues/05-github-and-gitlab-structured-data-capabilities.md): GitHub is natively rich and gh covers it; GitLab gates much to Premium and glab needs raw API.
- [What the engine owns vs. what agents write](issues/01-what-the-engine-owns-vs-what-agents-write.md): Engine is sole writer of structured state; agents supply prose via commands; controlled append-only edits; sandboxing to prevent bypass.
- [Ticket and map lifecycle](issues/02-ticket-and-map-lifecycle.md): Ticket is named parts (report, analysis log, description, summary); edits via revisions, reopen for resolved; map charting or done.
- [Live state reporting: improve, shrink or cut](issues/06-live-state-reporting-improve-shrink-or-cut.md): Cut panel, ticket.changed, lock file, adoption and guesser; keep a session-only state channel.

## Not yet specified

- Storage format and where the truth lives (is the repo still the source of truth?)
- Effect on the local, GitHub and GitLab backends
- UX rework: title and fog-item shape, description structure, what each screen shows, the unslop command's diff-and-accept view
- The prompt set Dryland ships, and tracking upstream skill releases
- Migration tooling from a skills-only repo
- Which ADRs are superseded; spec and glossary consequences
- Agent CLI adapter cleanup after dropping the best-effort tier (may need no ticket)

## Out of scope

- Implementing any of it.
- Agent CLIs other than Claude Code and Copilot CLI.
- Features that do not depend on the new model: packaging, auto-update, the embedded terminal.
