# Map writes, derived Decisions so far and init

Type: task
Status: resolved
Blocked by: 43

## Question

**Read first:** ADRs 0011 and 0015, `GLOSSARY.md`, the Answers of tickets 41 to 43 and the porting list in 41, and the old map code (`packages/core/src/map.ts`, `map-write.ts`) and the new map and new ticket dialogs in `packages/desktop`.

**What to build:** the remaining old write paths on the store, and the setup flow for a fresh repo.

- [x] The new map and new ticket dialogs work in a store repo
- [x] Decisions so far is derived from resolved tickets (title plus first sentence of the summary), so the old `map index` write is not ported
- [x] `dryland init` creates the store and replaces the `setup-matt-pocock-skills` next step for a fresh repo
- [x] The map screen shows Destination, Notes, frontier, blocked and claimed, and Decisions so far from the store; out-of-scope and fog sections show what the old map text held
- [x] Old tests of these paths are ported or deleted per ticket 41's porting list

## Answer

Built in bdbb6a0 and 867f20e. Decisions so far is derived on every read (`decisionsOf`): one line per resolved ticket, its title and the first sentence of its answer, in ticket order; it feeds the map model, the `map show` document and both map views. The map tab and `map show --text` list Destination, Notes, frontier, blocked (with what each waits for), claimed (with the holder), Decisions so far, fog and out of scope, from one shared `mapGroups` split. `map index` is not ported: in a store repo it is refused with the reason and the `ticket resolve` next action. The new ticket dialog builds a ticket document and the new map dialog (effort, title, destination) a map document; both are piped to `ticket create` and `map create`, previewed and confirmed as `dryland ... < {json}`, and the desktop CLI runner now takes stdin. A markdown repo keeps the old dialogs. The no-setup rule now recommends `dryland init` (evidence: no store, no tracker doc) and `/setup-matt-pocock-skills` left `RECOMMENDED_SKILLS`.

Porting list: `map-index` stays green on markdown until 45 deletes it; its store counterpart is the refusal test in `map-store.test.ts`. `store-maps.test.ts` covers Decisions so far, the map tab and the init next step; the dialogs have unit tests in `tracker-actions.test.ts` and store e2e cases in `ticket-actions-store.spec.ts`.

Tests: `pnpm test` 991 passed; `pnpm test:linux` 997 passed; desktop e2e native 52 passed; `pnpm test:e2e:linux` 51 of 52, the one failure being the old markdown "releases a possibly stale claim" case known to fail on Linux. The Linux and e2e runs were made on bdbb6a0, before the grouping refactor in 867f20e, which `pnpm test` covers. Code review (Standards and Spec) run; fixed the duplicated frontier logic.

Known limits: a map cannot be edited after creation (no `map edit`); the New map dialog on a store no longer starts a `/wayfinder` session; the `dryland init` step is shown but there is no button that runs it; the confirmation shows `dryland map create < {json}`, which is display, not a copyable shell line; `firstSentence` cuts at the first `.`, `!` or `?` followed by a space, so abbreviations such as "e.g." end it; the CLI prints "Fog:" and the tab "Not yet specified".
