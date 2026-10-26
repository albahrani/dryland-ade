# Desktop and rule engine read the store

Type: task
Status: resolved
Blocked by: 41

## Question

**Read first:** ADRs 0011 and 0012, `GLOSSARY.md`, ticket 41's Answer and its porting list, and the code that reads tickets today (`packages/core/src/tickets.ts`, `project-state.ts`, `next-step.ts`, `tickets-tree.ts`).

**What to build:** in a store repo, everything that shows tickets and maps reads the store, and the desktop refreshes when the store moves. Nothing is written yet beyond what ticket 41 created.

- [x] The tickets tree, ticket tab, maps list and map tabs show store tickets and maps, including criteria, triage role, claim and blockers
- [x] The next-step rule engine and the repo snapshot read tickets and maps from the store; the slice-of-spec checks read the ticket's `spec` field and Report instead of a `Spec:` header and a `## Question` heading
- [x] `worktree create`, `list` and `prune` read tickets from the store (their claims move in ticket 43)
- [x] The desktop refreshes when the state ref moves (watch the ref or poll its head), without `ticket.changed`
- [ ] The existing e2e specs for these screens also run on a store fixture; markdown repos keep working
- [ ] Core tests of the rule engine and tickets tree run on store fixtures

## Answer

Built in 65e9668. `readEfforts` takes maps from the store (specs stay files), `Ticket` carries `spec` and `criteria`, and the slice-of-spec check reads the `spec` field; a store repo counts as set up. The ticket tab shows the Report, a criteria checklist and the triage role; the map tab renders the map record as markdown. `worktree create` names the branch from the title. `watchProject` polls the state ref head every second and refreshes when it moves. `worktree list` and `prune` already read through `readTickets`, which reads the store.

Tests: `store-readers.test.ts` (tree, snapshot, rules, map and ticket detail, worktree, widget, head) and a watcher test; `state-store.spec.ts` is rewritten on a store fixture and passes natively. Full suite passes natively and in Linux.

Known limits: the criteria on running the existing rule-engine, tickets-tree and e2e specs on store fixtures are not met in full. New store cases cover the store paths, but `next-step`, `tickets-tree`, `smoke`, `next-up` and the other specs have no store twin. The `## Question` check still runs on the Report text. Answers and comments of a store ticket are empty until 43. The header still says "No tracker" for a store repo. Each reader replays the store separately; a shared snapshot is not built.
