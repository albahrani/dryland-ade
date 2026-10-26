# Store model parity: documents, efforts, maps and ticket fields

Type: task
Status: ready-for-agent
Blocked by: 39

## Question

**Read first:** ADRs 0011, 0012 and 0015, `GLOSSARY.md`, ticket 14's Answer and the store code it built (`packages/core/src/state-store.ts`).

**What to build:** the first of four tickets (41 to 44) that make the state store the only tracker with the behaviour the old tracker had and no new rules. Here the store gets the structured-document contract of ADR 0015, efforts, maps and every field a ticket has at creation, and reads return documents too. Until ticket 45 a repo is either on the store (it ran `dryland init`) or on markdown.

The write contract (ADR 0015): every write is one document on stdin, run as parse (schema), check (content rules) and apply (compare-and-set); `--check` stops before apply; a diagnostic is one line with field path, rule id, what was wrong and the fix; the exit code tells which step failed. Reads take a reference argument and return a document by default, with a `$schema` id and field descriptions in the command help, so an agent never guesses a format; `--text` renders it for people.

Model decisions: tickets belong to an **effort** slug and are referenced as `effort/NN`; a map record is optional on an effort, and a standalone ticket is an effort with no map. Specs stay files at `.scratch/<effort>/spec.md`. Every event carries a `schema` number; events written by the tracer need not keep working, since nothing is released.

- [ ] The write contract above is built once and used by `ticket create` and `map create`: schema parse, check, apply, `--check`, path-addressed diagnostics, distinct exit codes per step, help with an example document generated from the schema
- [ ] Ticket document: `effort`, `title`, `type`, `report`, `criteria: [{text, done}]`, `spec` (optional), `blockedBy`, `triageRole`, `hitl`; ticket 14's flag-based create is replaced
- [ ] Map document: `effort`, `title`, `destination`, `notes`, `fog: []`, `outOfScope: []`; editing comes in 44 and records in 20
- [ ] The ticket read model carries criteria with ticks, triage role, claim holder and time, blockers, spec link and status; the events that change them come in ticket 43
- [ ] `ticket show`, `ticket list`, `map show` and `map frontier` read the store and return documents with a `$schema` id; `--text` renders them
- [ ] A bare id that exists in several efforts, an unknown ticket or effort and a malformed reference fail with the next action stated
- [ ] One helper builds a throwaway store repo with efforts, maps and tickets for core, CLI and e2e tests
- [ ] Events carry a `schema` number, and an event of an unknown schema fails loudly on replay

## Porting list

The old tests are the spec for parity. **Port** means rewrite against a store fixture in the named ticket; **delete** means it pins file or git-commit behaviour the store does not have; the Answer records what was done with each.

CLI, ported here (41): `ticket-list` (prints id, title, type, state; JSON; from a linked worktree; empty tracker; no git or bare repo errors), `ticket-model` (full model, blockers, no blockers, bare id in several efforts, unknown ticket, malformed reference, triage role, `map show` grouping, `map frontier` ordering and empty case, frontier writes nothing).
CLI, ported in 43: `ticket-claim` (claim for the branch, one parallel winner tells losers who holds it, claim from a linked worktree, release, release of an unclaimed ticket fails), `ticket-create-resolve` (numbering, parallel creates, unknown effort and type, resolve records the answer and unblocks dependants, resolve releases the claim, refusals, tick the nth criterion and parallel ticks, amend), `ticket-block-comment-triage` (block and unblock against the frontier, rejected self, repeated and absent blockers, comment appended, triage roles and refusal to retriage a claimed or resolved ticket), `worktree` (naming, scratch worktrees, linking, prune conditions; these read and claim tickets), `session-index`.
CLI, deleted in 45 (file or commit format): `ticket-header-placement`, `ticket-line-endings`, `map-index` (Decisions so far is derived from 44), the `real-scratch` fixtures and the real-ticket cases of `ticket-list` and `ticket-model`; from `ticket-claim` the cases about auto-commit, `--commit` and `--no-commit`, the default branch, restoring the file, a crashed temp file and the lock file; from `ticket-create-resolve` the Status-line and Answer-heading cases.
Core, ported in 42 (read fixtures): `next-step`, `tickets-tree`, `project-state`, `item-detail`, `specs-without-tickets`, `repo-snapshot-pr`, `merge`, `pull-request`, `session-reconcile`, `worktree-at`, `tracker-widget`; each is checked for markdown-shaped fixtures when ported.
Core, deleted in 45: `github-backend`, `github-write`, `gitlab-backend`, `compat`, `skill-setup`, and the parts of `doctor` that test the compatibility verdict.
Desktop e2e: `smoke`, `next-up`, `start-work`, `multiple-projects`, `reconcile`, `merge` run on store fixtures in 42; `ticket-actions` in 43; `skill-setup` is deleted in 45 and `live-events` in 40.
