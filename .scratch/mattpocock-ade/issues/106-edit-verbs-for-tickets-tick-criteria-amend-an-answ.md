# Edit verbs for tickets: tick criteria, amend an answer, edit a body

Type: task

## Question

Skills and our closing procedure need to edit tickets, but the CLI has no verb for it, so AGENTS.md tells agents to tick boxes by hand and a wrong ## Answer can only be corrected by a comment (seen on mattpocock-ade/54). Add narrow, locked, atomic, scoped-commit verbs through the same write path as the other ticket commands: (1) `dryland ticket tick <map>/<NN> --criterion <n>` for acceptance criteria; (2) `dryland ticket resolve --amend` to replace an existing Answer; (3) decide whether a `ticket edit` for title/body/criteria should exist at all. That one reopens what ADR 0001 closed, so it needs a decision: perhaps only on non-resolved tickets, with the change recorded. Then add matching Tick/Amend/Edit operations to docs/agents/issue-tracker.md so skills (implement, triage, to-tickets) have a sanctioned call, and change AGENTS.md 'Closing a ticket' step 1 from hand-ticking to the new verb. Acceptance: each verb is covered by CLI tests including concurrent writes; the tracker doc defines the operations; AGENTS.md has no hand-edit step; the desktop app shows the change like other tracker writes. Open question for the human: is ticket edit in scope?
