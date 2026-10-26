# Desktop and rule engine read the store

Type: task
Status: ready-for-agent
Blocked by: 41

## Question

**What to build:** in a store repo, everything that shows tickets and maps reads the store, and the desktop refreshes when the store moves. Nothing is written yet beyond what ticket 41 created.

- [ ] The tickets tree, ticket tab, maps list and map tabs show store tickets and maps, including criteria, triage role, claim and blockers
- [ ] The next-step rule engine and the repo snapshot read tickets and maps from the store
- [ ] The desktop refreshes when the state ref moves (watch the ref or poll its head), without `ticket.changed`
- [ ] The existing e2e specs for these screens also run on a store fixture; markdown repos keep working
- [ ] Core tests of the rule engine and tickets tree run on store fixtures
