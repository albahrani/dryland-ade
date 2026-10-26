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
- Tickets and map indexes are edited by hand during the rework; the `dryland` CLI is not used on this tracker. This repo's own tracker stays plain files, as the Matt Pocock skills intend, and is migrated only when its owner decides, after trying Dryland on other projects. No ticket depends on it.
- Definition of done, applying to every build ticket (so tickets do not repeat it): (1) every listed criterion is ticked and none points at a later ticket; (2) behaviour is covered at the CLI seam, plus Playwright where UI changed; (3) `pnpm test` and `pnpm test:linux` pass, plus the e2e pair after desktop changes; (4) ADRs and glossary are amended if the slice found them wrong; (5) code the slice replaces is deleted in the same commit once nothing else uses it.
- Re-slice (after the tracer, ticket 14): the tracer showed that slicing by feature on top of a live markdown path leaves no ticket fully acceptable. The tickets now first make the store the only tracker with today's behaviour (flip, 41 to 45), then add the new rules on one path. Old tickets 36 and 37 are gone: 36 became 45, and 37's commands were split between 41 and 43 (triage, ticks, release, standalone) and 21 (the HITL flag). Ticket 38 lost its prune to 46.
- Order of work, each line after the previous unless it says "with": 39 and 40 (independent, first); flip 41, 42, 43, 44, 45; then 38, 15, 16, 17, 18, 19, 20, 21, 34, 25; then 26, 22, 23, 27, 24, 46, 31, 28, 29, 30; then 32, 33; last 35. The `Blocked by` lines are the authority.
- During the flip a repo is either on the store (it ran `dryland init`) or on markdown. Tests that pin markdown behaviour stay green until 45 deletes them; ported behaviour gets new tests on store fixtures, following the porting list in ticket 41's Answer.

## Decisions so far

- [Rules and workflow in the upstream skills](issues/03-rules-and-workflow-in-the-upstream-skills.md): Upstream rules split into a mechanical shell (order, enums, sections, gates) and a judgement core; see research file.
- [What the UI gets from live state reporting](issues/04-what-the-ui-gets-from-live-state-reporting.md): Live events feed only session badges, the events panel and instant refresh; core flows do not need them.
- [GitHub and GitLab structured-data capabilities](issues/05-github-and-gitlab-structured-data-capabilities.md): GitHub is natively rich and gh covers it; GitLab gates much to Premium and glab needs raw API.
- [What the engine owns vs. what agents write](issues/01-what-the-engine-owns-vs-what-agents-write.md): Engine is sole writer of structured state; agents supply prose via commands; controlled append-only edits; sandboxing to prevent bypass.
- [Ticket and map lifecycle](issues/02-ticket-and-map-lifecycle.md): Ticket is named parts (report, analysis log, description, summary); edits via revisions, reopen for resolved; map charting or done.
- [Live state reporting: improve, shrink or cut](issues/06-live-state-reporting-improve-shrink-or-cut.md): Cut panel, ticket.changed, lock file, adoption and guesser; keep a session-only state channel.
- [Sandboxing the agent CLIs on a need-to-know basis](issues/07-sandboxing-the-agent-clis-on-a-need-to-know-basis.md): Three isolation levels (Off, Guarded, Contained); no agent write path to state; access requests with fail-fast AFK.
- [Storage format and where the truth lives](issues/08-storage-format-and-where-the-truth-lives.md): Truth is an append-only event log on a never-checked-out git ref; syncs to an optional state remote; forges are reporting channels only.
- [Migration from a skills-only repo](issues/09-migration-from-a-skills-only-repo.md): Explicit hands-off dryland migrate: idempotent import on a branch and staging ref, verified finish, installs prompts, zero loss via verbatim originals.
- [The prompt set Dryland ships and tracking upstream releases](issues/10-the-prompt-set-dryland-ships-and-tracking-upstream.md): Workflow skills ship as prompts built from a pinned upstream snapshot plus overlays, synced per launch; user overrides allowed; maintainer adopts releases.
- [UX rework for the engine-owned model](issues/11-ux-rework-for-the-engine-owned-model.md): Named Description sections, collapsed log and History, derived map screen, unslop diff with ticks, plain Mark done, Suggest helper for hand-written one-liners.
- [ADRs superseded and spec and glossary consequences](issues/12-adrs-superseded-and-spec-and-glossary-consequences.md): Five new ADRs; 0001, 0003, 0008, 0009 superseded, 0004-0007 and 0010 amended; lens mode and best-effort tier dropped.
- [Rework ADRs and glossary](issues/13-rework-adrs-and-glossary.md): ADRs 0011 to 0015 added, old ADRs noted, glossary reworked.
- [Tracer: one ticket from CLI to desktop](issues/14-tracer-one-ticket-from-cli-to-desktop.md): Event-log state store on refs/dryland/state with a SQLite cache serves ticket create, show, list and the desktop; old reader removal deferred.
- [Git inside the sandbox with the state ref outside](issues/39-git-inside-the-sandbox-with-state-outside.md): State moves to a separate bare git dir; Guarded denies its path, Contained mounts a clone.
- [Cut the features that do not need the tracker](issues/40-cut-the-features-that-do-not-need-the-tracker.md): Codex and Gemini adapters, auto-submit, output-guessed status, hand-started adoption and the live-events panel are gone; hook-fed status, `ticket.changed` and the lock file stay.
- [Session-state channel](issues/25-session-state-channel-and-adapter-cuts.md): a Live event is a running, waiting, idle or ended report with no payload, and `ticket.changed` is gone.

## Not yet specified

None. The adapter cleanup folded into the ADRs superseded ticket.

## Out of scope

- Implementing any of it.
- Agent CLIs other than Claude Code and Copilot CLI.
- Features that do not depend on the new model: packaging, auto-update, the embedded terminal.
