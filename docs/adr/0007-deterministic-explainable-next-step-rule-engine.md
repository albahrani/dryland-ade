# Next steps come from a deterministic, explainable rule engine

The **next step** is computed by a pure function in the core: a repo snapshot goes in, a ranked list of next steps comes out, each with a target artifact, a recommended skill command, a rule id, a one-sentence reason and an evidence list (which artifact and field was read). The rules are ordered code. An LLM was rejected: recommendations must be the same for the same repo state, explainable, free, and available with no session running. User-editable rules were rejected for v1 as premature.

## Decisions

- **Snapshot**: normalized tickets and maps (ADR 0008), presence of spec, ADR and glossary files, coarse git state per linked worktree (exists, ahead of the default branch, merged; PR exists for GitHub/GitLab, optional), live session state, skill setup state and compatibility verdict (ADR 0003).
- **Routing**: only the skills with a mechanical artifact trigger are recommended. No setup config: `/setup-matt-pocock-skills`. `needs-triage` item: `/triage`. Map with a frontier ticket: `/wayfinder <map>` naming the ticket. Cleared map (no open child tickets, no fog): `/to-spec <map>`. Spec without tickets: `/to-tickets`. Spec with ready tickets: `/implement-spec`, or `/implement` per `ready-for-agent` ticket. Branch ahead and ticket done: `/pr`, with `/code-review` before. Merged feature: `/retro`.
- **Priority**: a missing setup config first (nothing else works without it), then waiting sessions, then possibly stale claims, then map frontier (lowest number first), then ready implementation work, then untriaged or unspecified work, then housekeeping (`/pr`, `/retro`).
- **Stale claims**: a claim no live Dryland session holds is flagged "claimed, possibly stale". It is never auto-released; release is an explicit action through `dryland`.
- **Tracker independence**: the engine reads only the normalized ticket model and takes label strings from `docs/agents/triage-labels.md`. Facts a backend cannot supply are flagged unknown ("blocking unknown"), never guessed.
- **"Why not X?"**: the UI can list the unresolved blockers of any item that is not next.

## Consequences

- All other skills (`grill-with-docs`, `diagnosing-bugs`, `prototype`, `research`, `handoff` and the rest) are never recommended by rules and stay launchable by the user.
- The engine cannot know whether a session finished its work or what the user intends, so every recommendation is ignorable. `dryland` calls and live session events feeding the snapshot narrow that gap.
- The engine is tested table-driven, one fixture snapshot per rule, with an assertion on the reason text (ADR 0004).
- A new skill workflow upstream means a code change and a release, not a config edit.
