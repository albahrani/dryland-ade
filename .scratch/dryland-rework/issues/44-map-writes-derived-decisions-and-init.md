# Map writes, derived Decisions so far and init

Type: task
Status: ready-for-agent
Blocked by: 43

## Question

**Read first:** ADRs 0011 and 0015, `GLOSSARY.md`, the Answers of tickets 41 to 43 and the porting list in 41, and the old map code (`packages/core/src/map.ts`, `map-write.ts`) and the new map and new ticket dialogs in `packages/desktop`.

**What to build:** the remaining old write paths on the store, and the setup flow for a fresh repo.

- [ ] The new map and new ticket dialogs work in a store repo
- [ ] Decisions so far is derived from resolved tickets (title plus first sentence of the summary), so the old `map index` write is not ported
- [ ] `dryland init` creates the store and replaces the `setup-matt-pocock-skills` next step for a fresh repo
- [ ] The map screen shows Destination, Notes, frontier, blocked and claimed, and Decisions so far from the store; out-of-scope and fog sections show what the old map text held
- [ ] Old tests of these paths are ported or deleted per ticket 41's porting list
