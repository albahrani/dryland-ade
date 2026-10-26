# Desktop and rule engine read the store

Type: task
Status: ready-for-agent
Blocked by: 41

## Question

**Read first:** ADRs 0011 and 0012, `GLOSSARY.md`, ticket 41's Answer and its porting list, and the code that reads tickets today (`packages/core/src/tickets.ts`, `project-state.ts`, `next-step.ts`, `tickets-tree.ts`).

**What to build:** in a store repo, everything that shows tickets and maps reads the store, and the desktop refreshes when the store moves. Nothing is written yet beyond what ticket 41 created.

- [ ] The tickets tree, ticket tab, maps list and map tabs show store tickets and maps, including criteria, triage role, claim and blockers
- [ ] The next-step rule engine and the repo snapshot read tickets and maps from the store; the slice-of-spec checks read the ticket's `spec` field and Report instead of a `Spec:` header and a `## Question` heading
- [ ] `worktree create`, `list` and `prune` read tickets from the store (their claims move in ticket 43)
- [ ] The desktop refreshes when the state ref moves (watch the ref or poll its head), without `ticket.changed`
- [ ] The existing e2e specs for these screens also run on a store fixture; markdown repos keep working
- [ ] Core tests of the rule engine and tickets tree run on store fixtures
