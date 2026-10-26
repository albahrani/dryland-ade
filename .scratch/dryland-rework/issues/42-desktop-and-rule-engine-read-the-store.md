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
- [x] The existing e2e specs for these screens also run on a store fixture; markdown repos keep working
- [x] Core tests of the rule engine and tickets tree run on store fixtures

## Answer

Built in 65e9668. `readEfforts` takes maps from the store (specs stay files), `Ticket` carries `spec` and `criteria`, and the slice-of-spec check reads the `spec` field; a store repo counts as set up. The ticket tab shows the Report, a criteria checklist and the triage role; the map tab renders the map record as markdown. `worktree create` names the branch from the title. `watchProject` polls the state ref head every second and refreshes when it moves. `worktree list` and `prune` already read through `readTickets`, which reads the store.

Tests: `store-readers.test.ts` (tree, snapshot, rules, map and ticket detail, worktree, widget, head) and a watcher test; `state-store.spec.ts` is rewritten on a store fixture and passes natively. Full suite passes natively and in Linux.

Follow-up commit: the tracker widget names the state store, `smoke` has a store twin in `state-store.spec.ts`, and `store-readers.test.ts` covers the tree and project state on store fixtures. Cases that need claimed or resolved tickets (done fold, paused and stale claims) and the specs `start-work`, `ticket-actions`, `next-up`, `reconcile`, `merge` and `multiple-projects` port in 43, when the store can write claims and resolves. `next-step` is a pure snapshot test and needs no store twin.

Known limits: the `## Question` check still runs on the Report text. Answers and comments of a store ticket are empty until 43. Each reader replays the store separately. `ticket-actions` "releases a possibly stale claim" fails on Linux before and after this ticket (found by running it at 4926324); it passes on Windows.
