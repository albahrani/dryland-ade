# Tick criteria and amend an answer from the CLI

Type: task
Status: claimed
<!-- dryland: {"claim":{"holder":"main","at":"2026-10-21T16:56:44.696Z","was":"ready-for-agent"}} -->

## Question

Split from mattpocock-ade/106. Agents tick acceptance criteria by hand and can only correct a wrong Answer with a comment (seen on mattpocock-ade/54). Add two narrow verbs through the same locked, atomic, scoped-commit write path as the other ticket commands:

1. `dryland ticket tick <map>/<NN> --criterion <n>` ticks the nth acceptance criterion.
2. `dryland ticket resolve <map>/<NN> --answer <text> --amend` replaces the existing Answer of a resolved ticket.

Then add matching Tick and Amend operations to docs/agents/issue-tracker.md so skills (implement, triage, to-tickets) have a sanctioned call, and change AGENTS.md "Closing a ticket" step 1 from hand-ticking to the new verb.

Out of scope: a general `ticket edit` for title, body or criteria (kept on mattpocock-ade/106 as a decision).

### Acceptance criteria

- [ ] `ticket tick` ticks the nth criterion; a bad number, an already ticked box or a missing criteria list gives a clear error
- [ ] `ticket resolve --amend` replaces the Answer; without `--amend`, resolving a resolved ticket still fails
- [ ] Each verb is covered by CLI tests, including concurrent writes
- [ ] docs/agents/issue-tracker.md defines Tick and Amend
- [ ] AGENTS.md has no hand-tick step
- [ ] The desktop app shows the change like other tracker writes
