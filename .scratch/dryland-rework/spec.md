Status: ready-for-agent

# Spec: Dryland rework

Source: the closed `dryland-rework` map (`map.md`, `issues/`, `research/`). Decisions live in the tickets; this spec restates them as buildable behaviour. Where it conflicts with ADRs 0001 to 0010, this spec wins and the ADR set (see Implementation Decisions, ADRs) records it.

## Problem Statement

Dryland is a lens over markdown files that upstream skills write. Agents can write anything to those files, so structure drifts, prose bloats, and the app cannot enforce claim-before-work, one resolve per session, or human gates. Two sources of truth (files and forge issues), best-effort CLI tiers, a live-events panel and file-fingerprint compatibility checks add weight without protecting the workflow.

## Solution

Dryland becomes the source of truth for maps, fog, tickets and comments. The engine alone writes structured state; agents run prompts and supply prose through `dryland` commands. State is an append-only event log on a hidden git ref, optionally synced to a state remote. Agent CLIs run under an isolation ladder with no write path to state. Prompts derive from a pinned upstream snapshot plus overlays. The UI shows named ticket parts, history, and a human-gated unslop flow. Skills-only repos move over with one explicit `dryland migrate`. Lens mode is dropped.

## User Stories

1. As a maintainer, I want the engine to be the only writer of structured state, so that agents cannot corrupt types, statuses or blocking edges.
2. As a maintainer, I want claim-before-work enforced, so that two sessions never work one ticket.
3. As a maintainer, I want one resolve per session (research excepted) enforced, so that a session cannot burn through the map.
4. As a maintainer, I want blocking edges kept acyclic, so that the frontier is always computable.
5. As a human, I want the frontier computed by the engine, so that I see what is takeable without reading files.
6. As a human, I want a HITL ticket to resolve only after my confirmation in the UI, so that an agent cannot answer for me.
7. As an agent, I want to submit every write as a structured document on stdin, with prose only inside its prose fields, so that I never touch file paths or state files.
8. As an agent, I want write-time diagnostics with the field path, rule id and fix, and a `--check` mode that validates without writing, so that I can correct the document and retry.
9. As a human, I want over-cap text rejected, never truncated, so that nothing is silently lost.
10. As a human, I want short titles that name the decision (about 60 chars) and one-sentence fog items (about 140), so that the map reads at a glance.
11. As a human, I want a ticket to have Report, Analysis log, Description and Solution summary, so that each kind of text has one place.
12. As a human, I want the Report fixed once claimed (human edits only, revisioned), so that the question does not shift under the agent.
13. As an agent, I want to append typed Analysis log entries (finding, failed-attempt, correction, retraction), so that dead ends are kept.
14. As a human, I want corrections and retractions to point at an earlier entry with a one-line reason, so that I can follow why.
15. As a human, I want retracted entries struck and collapsed, never deleted, so that history stays honest.
16. As a human, I want a Description with Problem, Cause and Plan sections, so that the current state of a ticket is scannable.
17. As an agent, I want resolve to require Problem and Plan (plus Cause for bugs) and a summary within caps, so that resolved tickets are complete.
18. As a human, I want every edit to append a revision with time, author kind and reason, so that I can audit changes.
19. As a human, I want author kind (human, agent, engine) shown in History, so that I know who wrote what.
20. As a human, I want to amend a resolved summary with a required reason, so that I can fix errors cheaply.
21. As an agent, I want to reopen a resolved ticket with a reason, so that wrong answers get corrected.
22. As a human, I want a reopened badge that stays until I dismiss it, so that I review agent reopens.
23. As a human, I want fog items as records (open, graduated to a ticket, dropped with a reason), so that fog has a lifecycle.
24. As an agent, I want graduating fog to be one atomic command (create ticket, wire blockers, remove item), so that the map never half-updates.
25. As a human, I want Decisions so far derived from resolved tickets, so that the index never drifts from the answers.
26. As a human, I want map status charting or done, and Mark done offered only with no open tickets or fog, so that done means done.
27. As a human, I want Mark done to be a plain confirmation, so that I do not write text nobody reads.
28. As a human, I want Destination edits to be human-only, so that agents cannot redraw the goal.
29. As a human, I want an Unslop command that proposes a denser rewrite, so that bloated text shrinks.
30. As a human, I want a side-by-side word-level diff, char count against cap, and three ticks (clear, dense, nothing cut) before Accept, so that I do not accept lossy rewrites.
31. As a human, I want Reject to discard the proposal, so that nothing changes by accident.
32. As a maintainer, I want workflow-triggered unslop to apply without acceptance but be marked agent-authored, so that automation (such as migration) can run unattended.
33. As a human, I want a Suggest button beside hand-written one-liners, so that I get a draft within the cap.
34. As a human, I want a Suggest draft saved as human-authored once I accept it, so that authorship is simple.
35. As a human, I want `ticket show` to print summary and Description, `--log` to add the Analysis log, `--history` to add revisions, so that I read only what I need.
36. As a maintainer, I want a command that collates solution summaries by type over a range, so that I get release notes with no model.
37. As a maintainer, I want the state store to be an append-only event log on a dedicated git ref that is never checked out, so that no worktree or container mount contains state.
38. As a maintainer, I want state derived by replay into a disposable SQLite cache with periodic snapshots, so that reads are fast and the cache can be rebuilt.
39. As a maintainer, I want pruning to be a manual action only, so that history is never lost automatically.
40. As a maintainer, I want `dryland export` to render read-only markdown, so that I can read state outside the app without it becoming a source.
41. As a team member, I want to choose a state remote per repo (local-only default, origin, or another remote), so that I decide where state is visible.
42. As a team member, I want consent recorded per remote with the visibility downside stated, so that I never publish state by accident.
43. As a team member, I want `dryland state join <url>`, so that I join a team's state without the URL being stored in the ref.
44. As a team member, I want automatic fetch and push by default with a manual or off setting, so that I control sync.
45. As a team member, I want a failed push never to block a command, so that I can work offline.
46. As a team member, I want first-to-remote to win a claim, offline claims to be provisional, and double resolves rejected at sync, so that conflicts resolve predictably.
47. As a maintainer, I want attachments (research, prototype assets) stored in the state store, size-capped, with a warning when the remote is public, so that nothing leaks silently.
48. As a maintainer, I want prose files (GLOSSARY, ADRs, specs) to stay ordinary files merged by git, so that docs keep normal review.
49. As a maintainer, I want GitHub and GitLab issues ingested idempotently as human-authored Reports linked by URL into needs-triage, so that forge intake still works.
50. As a maintainer, I want claim, resolve and reopen posted back to the forge issue, with no two-way edits, so that forges are reporting channels only.
51. As a maintainer, I want forge tokens to stay with the engine, so that agents never see them.
52. As a user, I want three isolation levels (Off with a warning, Guarded by default, Contained in Docker), so that I pick safety against speed.
53. As a user, I want feature toggles per level, so that I can tune without changing level.
54. As a user, I want tracker state writes denied in every level except through `dryland` commands, so that bypass is impossible by construction.
55. As a user, I want a per-session token tied to one ticket, so that a session cannot act on other tickets.
56. As a user, I want a sandbox profile derived from ticket type (worktree writes plus a per-type extra), so that research and prototype sessions get only what they need.
57. As a user, I want the starting brief to hold only the map, the own ticket and blocker answers, so that agents do not see other sessions' in-progress work.
58. As a user, I want secrets protected (scrubbed env, home credential paths denied), so that a hostile agent cannot read them.
59. As a user, I want access requests with five answers (deny, deny and never ask, allow once, session, always) and a required reason, so that I control exceptions.
60. As a user, I want one rule store translated into each CLI's native rules, so that I see one prompt.
61. As a user, I want a settings screen listing and revoking rules, with a repo layer that can only narrow, so that a repo cannot widen my permissions.
62. As an AFK user, I want to pre-approve extras at launch, and denials to end the agent blocked without workarounds, so that unattended runs fail fast and safely.
63. As a user, I want a caught bypass reverted from the log, recorded as a violation event, reported to the agent, and a second violation to pause the session, so that bypasses do not stick.
64. As a user, I want Dryland to ship the workflow prompts under their upstream names, so that familiar skills keep working.
65. As a maintainer, I want prompts generated from a pinned upstream snapshot plus overlays, with the build failing on a stale overlay anchor, so that drift is caught.
66. As a user, I want the prompt set synced into the agent CLI skill folder at every session launch, git-excluded, with version stamp and hash, so that stale or hand-edited copies are overwritten.
67. As a maintainer, I want `pnpm upstream:check` to list changed, added and removed upstream skills, so that adoption is a deliberate act.
68. As an expert user, I want global and repo prompt overrides (replace or append), so that I can customise.
69. As a user, I want stale replacements flagged with a diff and one dismissible badge for customised sessions, so that overrides do not go unnoticed.
70. As a user, I want engine gates to apply whatever the prompts say, so that overrides cannot weaken the workflow.
71. As a maintainer of a skills-only repo, I want `dryland migrate` with a dry-run preview, so that I see the effect before it happens.
72. As a maintainer, I want migration to import onto a branch and a local staging ref with per-step records, so that it is resumable and abortable.
73. As a maintainer, I want every imported record to keep its verbatim original as an attachment, so that migration loses nothing.
74. As a maintainer, I want migration ids deterministic and runs idempotent, so that re-running only resumes.
75. As a maintainer, I want over-cap fields shortened by a workflow unslop pass with a per-row report and one-action revert, so that migrated text fits without manual work.
76. As a maintainer, I want `migrate --finish` to verify counts and round-trip comparison before merging the staging ref, and `--abort` to remove branch and staging ref, so that failure is safe.
77. As a maintainer, I want migration to remove old shipped skills (hash-matched), `skills-lock.json` and the tracker docs, and to turn differing skills into repo overrides, so that the repo is workable right after finish.
78. As a user, I want a session-only state channel with fixed states (running, waiting, idle, ended), so that badges and waiting-first ranking work.
79. As a user, I want missing agent hooks reported as a `dryland doctor` error, so that I know why status is stale.
80. As a user, I want the ticket screen to show title, status, type, summary and Description, with the log collapsed and History on toggle, so that the page is short.
81. As a user, I want a derived map screen (Destination and Notes, frontier, blocked and claimed, fog, collapsed out-of-scope, Decisions so far), so that the map reads top-down.
82. As a human, I want inline editors with live counters and an optional reason per save, so that editing within caps is easy.
83. As a user, I want only Claude Code and Copilot CLI supported, with the best-effort tier, auto-submit and output guessing gone, so that status is hook-sourced and trustworthy.

## Implementation Decisions

**Engine (core).** One module owns the event log, replay, cache, caps, lint and gates. It never calls a model. Every command is an atomic compare-and-set within one repo. Every write command is parse (schema), check (content rules), apply (compare-and-set); `--check` stops before apply. Command results carry write-time diagnostics and violation notices to the agent.

**Ticket model.** Types: research, prototype, grilling, task (plus plain feature tickets). Statuses: open, claimed, resolved only. Parts and rules as in stories 11 to 22. Reopen needs a reason, sets open, keeps the old summary as a superseded revision, adds a correction entry, and needs a new summary at next resolve. Resolved tickets change only via amend or reopen.

**Caps and lint.** Per field kind, with overflow to a link plus gist. Ballparks (the spec fixes them; tune in build): title 60, fog item 140, Description 1200, summary 600, analysis entry 500 characters. Lint rejects hedges, filler, long sentences, file paths, line numbers and bare ids. Exact rules and style-guide wording are written during build.

**Map model.** Destination (human-only edits), Notes (command edits), both revisioned. Fog items and out-of-scope items are records. Decisions so far is derived (title plus first sentence of the summary). Status charting or done.

**Storage.** Immutable event files on a dedicated ref (for example `refs/dryland/state`), never checked out. Snapshots bound replay. Machine-local, never synced: cache, session index, lock, session tokens, isolation settings, transcripts. The event schema, prune protocol across clones, snapshot cadence and attachment caps are set during build.

**Forge intake.** Idempotent ingest keyed by URL; forges are reporting channels only. GitHub is natively rich and `gh` covers it; GitLab gates blocking and custom fields to Premium and leans on `glab api` (see `research/github-gitlab-structured-data.md`).

**Isolation.** Levels Off, Guarded (default), Contained (Docker mounting only the session worktree; microVMs a later level). Guarded is weaker than Contained; the spec per OS and CLI states what is enforced, and the doctor reports it. Deny lists, profile contents and CLI rule translation are set during build. In Contained, state is outside the mount.

**Prompt set.** Workflow-bearing upstream skills ship as prompts under upstream names (grilling, domain-modeling, grill-with-docs, wayfinder, research, prototype, triage, to-spec, to-tickets, implement, implement-spec, code-review, tdd, pr, retro, diagnosing-bugs, handoff). Dryland-native prompts: unslop and a small tracker primer. Agents reach state through the `dryland` CLI only: no MCP, no file paths.

**Session-state channel.** Schema of session id, state, timestamp; no payload; unknown states rejected. Sent by Claude Code and Copilot hooks. Feeds badges, waiting counts, waiting-first ranking and the session index `lastState`.

**Desktop UI.** Screens and flows as in stories 80 to 82, and the unslop and Suggest flows in stories 29 to 34. Suggest runs a read-only agent prompt and fills a draft within the cap.

**Migration.** As in stories 71 to 77. Mapping: Question becomes Report; Comments become finding entries; Answer becomes Solution summary; Type, Status, blocking, ticks, triage roles, Destination, Notes and fog carry over; research and prototype files become attachments; plain feature tickets become standalone tickets; claims import as open with a note; forge issues import as native tickets linked by URL. It runs the agent CLI compatibility check, which becomes `dryland doctor`, blocking finish only on findings that let an agent bypass the store.

**Cuts and replacements.** Remove: lens mode, `.scratch` ticket files as truth, annotations and fingerprinting, the compatibility verdict, skill setup state, the best-effort tier (Codex, Gemini), auto-submit, PTY output-guessing fallback, `statusApproximate`, `session.started`, hand-started adoption, the lock file, `ticket.changed` and its hook, and the live-events panel. Replace `setup-matt-pocock-skills` with `migrate` and `init`. Update the GLOSSARY "Live event" entry to mean a session state report.

**ADRs.** Five new ADRs: (1) engine owns structured state, agents supply prose; (2) event log on a dedicated ref with optional state remote, forges as reporting channels; (3) isolation ladder and access requests; (4) prompts derive from a pinned upstream snapshot through overlays, with overrides; (5) CLI surface and session-state channel. Superseded in whole: 0001, 0003 (consent flags survive for 0005), 0008, 0009. Amended with header notes (body untouched): 0004, 0005, 0006, 0007, 0010; 0002 gets one stale-wording fix. Adapter cleanup is an amendment note on 0006 plus the cuts above. Migration and UX go in this spec only.

**Glossary.** Remove: Best-effort tier, Approximate status, Auto-submit, Skill setup state, Compatibility verdict, ADE-owned annotation, ADE tracker, Hand-started session. Redefine: Live event, Ticket, Map, Fog item, Claim, Stale claim, Amend, Skill workflow. Add: Report, Analysis log, Description, Solution summary, Revision, Author kind, Reopen, Unslop, Suggest, State store, Event, State remote, Isolation level, Access request, Violation, Prompt set, Overlay, Override.

**Superseded stories.** Existing stories and sections on lens mode, compatibility checks, the live-events panel and best-effort CLIs are replaced by this spec and removed from earlier specs when built.

## Testing Decisions

- A good test drives external behaviour only: command in, output and state out. It never asserts on event file layout, cache tables or internal functions.
- **Seam 1: the `dryland` CLI** against a throwaway git repo with a real `refs/dryland/*` store. Covers caps and lint rejections, lifecycle (claim, resolve, reopen, amend), gates, frontier, fog graduation, revisions and history, export, release-notes collation, sync conflicts between two clones with a local bare remote, forge ingest with a stubbed forge, migration (dry run, resume, finish, abort, idempotence, round-trip), prompt sync and override ordering, session-state channel validation, isolation rule store and violation revert (Guarded), `doctor`.
- **Seam 2: Playwright e2e** on the desktop app for flows the CLI cannot show: ticket and map screens, unslop diff with ticks, Mark done, Suggest, access request prompts, migration report, customised-session badge.
- Contained mode needs Docker and runs in the Linux container script; without Docker, say so and leave it to CI.
- Prior art: `packages/cli/test` (for example claim, resolve, map-index, doctor, live-reporting, hooks tests) and `packages/desktop/e2e/*.spec.ts`. Tests for removed features (lens mode, live-events panel, compat, best-effort adapters, skill setup) are deleted with them. Follow the AGENTS.md rule to run `pnpm test`, then `pnpm test:linux`, and the e2e pair after desktop changes.

## Out of Scope

- Agent CLIs other than Claude Code and Copilot CLI.
- Packaging, auto-update, the embedded terminal.
- microVM isolation (a future level).
- Two-way forge edits.
- Late-arrival migration import, ongoing skills-only compatibility, and automatic adoption of new upstream skills.
- DeltaDB (Zed) as a dependency; inspiration only.

## Further Notes

- Unverified, to check during build: session-only skills for Copilot CLI, `--resume` behaviour in Claude Code, and some GitLab capabilities.
- Research backing: `research/upstream-skill-rules.md`, `research/live-state-reporting-audit.md`, `research/github-gitlab-structured-data.md`.
- Exact numbers (caps), schemas (events, analysis entries), deny lists and rule translation are deliberately left to the build tickets.
