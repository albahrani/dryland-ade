# Next-step rule engine

Type: grilling
Status: resolved
Blocked by: 02, 09

## Question

Define the deterministic rules mapping artifact state (map, ticket type/status/blocking, spec, issues, triage labels, git state) to a next step and recommended skill, including the "why this next" explanation and what the ADE can and cannot know from the default setup.


## Answer

- **Shape**: pure function, repo snapshot -> ranked list of next steps (target artifact, recommended skill command, why). Snapshot = normalized tickets/maps from `ade`, spec/ADR/glossary files, coarse git state, live ADE session state. Ordered rules in code; no LLM; no user-editable rules in v1; tested with fixture snapshots.
- **Routing (skills the engine recommends)**, from the upstream workflow graph (see `research/skills-catalog.md`): no setup config -> `/setup-matt-pocock-skills`; `needs-triage` item -> `/triage`; map with frontier ticket -> `/wayfinder <map>` naming the ticket; cleared map (no open child tickets, no fog) -> `/to-spec <map>`; spec without tickets -> `/to-tickets`; spec with ready tickets -> `/implement-spec` (whole spec) or `/implement` per `ready-for-agent` ticket; branch ahead and ticket done -> `/pr` (+ `/code-review` before); merged feature -> `/retro`. Fuzzy/undecided work is user-initiated (`/grill-with-docs`). Only ~6 of 38 skills have a mechanical trigger; all other skills (diagnosing-bugs, prototype, research, handoff, ...) are never recommended by rules and stay user-launchable from the ADE.
- **Priority**: waiting sessions > possibly stale claims > map frontier (lowest number first) > ready implementation work > untriaged/unspecified > housekeeping (`/pr`, `/retro`).
- **Stale claims**: shown as "claimed, possibly stale" when no live ADE session holds them; never auto-released; explicit "release claim" action via `ade`.
- **Git inputs**: only per linked worktree: exists, ahead of default branch, merged; PR-exists only for GitHub/GitLab, optional.
- **Explanation**: every step carries rule id, one-sentence reason, evidence list (artifact + field read); UI offers "why not X?" listing unresolved blockers.
- **Tracker independence**: engine reads only the normalized ticket model; labels from `docs/agents/triage-labels.md`; unsupported backend facts (e.g. GitLab blocking without Premium) flagged "blocking unknown", never guessed.
- **Limits**: cannot know whether a skill session finished its work or what is in the user's head; recommendations are ignorable. Mitigated by `ade` CLI calls and live hook/session updates (session ended/idle, ticket resolved via `ade`) feeding the snapshot where available.