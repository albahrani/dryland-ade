# Prompts derive from a pinned upstream snapshot through overlays

Dryland ships the workflow-bearing upstream skills as prompts under their upstream names, so familiar commands keep working, but it cannot let installed skill files define a workflow the engine enforces. Prompts are generated at build time from a pinned snapshot of the upstream skills plus Dryland's overlays.

## Decisions

- **Overlay**: swaps tracker operations for engine commands, adds engine facts, adds style rules. It never rewrites upstream's judgement content. The build fails when an overlay anchor no longer matches the snapshot.
- **Adoption**: `pnpm upstream:check` lists changed, added and removed upstream skills. Adopting a change is a deliberate act; new upstream skills are not adopted automatically.
- **Dryland-native prompts**: unslop and a small tracker primer.
- **Sync**: the prompt set is written into the Agent CLI's skill folder at every session launch, git-excluded, with a version stamp and hash, so stale or hand-edited copies are overwritten.
- **Overrides**: global and repo layers can replace a prompt or append to it. Stale replacements are flagged with a diff, and customised sessions show one dismissible badge.
- **Engine gates apply whatever the prompts say**, so an override cannot weaken the workflow.

## Consequences

- Replaces the skill-setup and compatibility machinery of ADR 0003: `setup-matt-pocock-skills` becomes `migrate` and `init`.
- The Agent CLI skill folder is no longer a source; the prompt set is tied to the Dryland release.
