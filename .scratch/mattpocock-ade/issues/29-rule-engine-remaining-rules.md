# Rule engine: remaining rules

Type: task
Status: resolved
Blocked by: 28

Spec: [spec](../spec.md), user stories 29 to 31, 35 to 39. "Next-step rule engine". ADR 0007.

## What to build

Complete the rule engine.

New rules:

- a session waiting for input is a next step, ranked first
- a claim with no live Dryland session behind it is flagged "claimed, possibly stale" (a Stale claim); it is never auto-released
- `needs-triage` item: `/triage`
- spec with ready tickets: `/implement-spec`, or `/implement` per `ready-for-agent` ticket
- branch ahead and ticket done: `/pr` (with `/code-review` before)
- merged feature: `/retro`

Full priority order: waiting sessions, then possibly stale claims, then map frontier (lowest number first), then ready implementation work, then untriaged or unspecified work, then housekeeping (`/pr`, `/retro`).

Also: unknown backend facts are flagged ("blocking unknown"), never guessed; a "why not X?" query lists X's unresolved blockers; skills without a mechanical trigger are never recommended. The snapshot now carries coarse git state per Linked worktree (exists, ahead of default branch, merged, optional PR exists), live session state, and skill setup state with compatibility verdict.

## Acceptance criteria

- [x] One fixture snapshot per new rule, asserting command, target, reason and evidence
- [x] A fixture with one candidate of every priority class asserts the full order
- [x] A ticket whose blockers are unknown is not put on the frontier and is flagged "blocking unknown"
- [x] "Why not X?" for a blocked ticket lists exactly its unresolved blockers; for a ticket with unknown blockers it says so
- [x] A stale claim produces a flag step and no step ever releases a claim
- [x] No step recommends a skill outside the mechanically triggered set
- [x] A rule disabled through the snapshot's compatibility verdict produces no steps, and an override re-enables it

## Answer

Completed the rule engine in packages/core/src/next-step.ts (commit 5a6cd87). New rules: waiting-session (command null, ranked after setup), stale-claim (flag only, command null, nothing ever releases), needs-triage (/triage), implement-spec (/implement-spec, spec with ready-for-agent tickets) and implement-ticket (/implement <map>/<NN>), review-before-pr (/code-review) then open-pr (/pr), retro (/retro), blocking-unknown (flag, ticket kept off the frontier). Order: setup, waiting, stale, frontier, implement-spec, implement-ticket, fog-only, cleared, needs-triage, spec-without-tickets, blocking-unknown, review-before-pr, open-pr, retro. whyNot(snapshot, ref) returns the unresolved blockers or unknown:true. RECOMMENDED_SKILLS fences the command set; a rule is disabled when the snapshot's skillSetup.verdict calls its rule id broken and not in skillSetup.overrides. Decisions: NextStep.command is null for flags and sessions; no-setup-config still ranks above waiting sessions; ready work is open, unclaimed, ready-for-agent with all blockers known and resolved; git, sessions and skillSetup being null means unknown and no rule guesses from them. Known limits: readRepoSnapshot still fills git, sessions and skillSetup with null; reading git state, live sessions and the verdict is for the session, worktree and skill-setup tickets (35 to 38, 53, 54).
