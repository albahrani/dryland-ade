# Store model parity: maps and ticket fields

Type: task
Status: ready-for-agent
Blocked by: 39

## Question

**What to build:** the first of four tickets (41 to 44) that make the state store the only tracker with the behaviour the old tracker had and no new rules. Here the store gains maps and every field a ticket has at creation, and the CLI reads them. Until ticket 45 a repo is either on the store (it ran `dryland init`) or on markdown.

- [ ] A map is a record with a create command; ticket 14 derives map names from tickets
- [ ] `ticket create` takes what the old command takes (map or none, title, type, question, acceptance criteria, blockers, triage role) and a standalone ticket needs no map
- [ ] A ticket's read model has criteria with ticks, triage role, claim holder and time, blockers and status; the events that change them come in ticket 43
- [ ] `ticket show`, `ticket list`, `map show` and `map frontier` read the store, with the output shape of the old commands
- [ ] One helper builds a throwaway store repo with maps and tickets for core, CLI and e2e tests
- [ ] A porting list in the Answer names every old test file and says which ticket of 41 to 44 ports it, and which ticket 45 deletes as file-format tests

Starting list: ported here are `ticket-list` and `ticket-model` tests; ported in 43 are `ticket-claim`, `ticket-create-resolve`, `ticket-block-comment-triage` and the worktree claim tests; deleted in 45 are `ticket-header-placement`, `ticket-line-endings`, `map-index` (Decisions so far is derived from ticket 44 on), the `real-scratch` fixtures and the GitHub and GitLab backend tests.
