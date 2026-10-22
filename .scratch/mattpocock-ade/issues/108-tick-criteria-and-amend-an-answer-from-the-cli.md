# Tick criteria and amend an answer from the CLI

Type: task
Status: resolved

## Question

Split from mattpocock-ade/106. Agents tick acceptance criteria by hand and can only correct a wrong Answer with a comment (seen on mattpocock-ade/54). Add two narrow verbs through the same locked, atomic, scoped-commit write path as the other ticket commands:

1. `dryland ticket tick <map>/<NN> --criterion <n>` ticks the nth acceptance criterion.
2. `dryland ticket resolve <map>/<NN> --answer <text> --amend` replaces the existing Answer of a resolved ticket.

Then add matching Tick and Amend operations to docs/agents/issue-tracker.md so skills (implement, triage, to-tickets) have a sanctioned call, and change AGENTS.md "Closing a ticket" step 1 from hand-ticking to the new verb.

Out of scope: a general `ticket edit` for title, body or criteria (kept on mattpocock-ade/106 as a decision).

### Acceptance criteria

- [x] `ticket tick` ticks the nth criterion; a bad number, an already ticked box or a missing criteria list gives a clear error
- [x] `ticket resolve --amend` replaces the Answer; without `--amend`, resolving a resolved ticket still fails
- [x] Each verb is covered by CLI tests, including concurrent writes
- [x] docs/agents/issue-tracker.md defines Tick and Amend
- [x] AGENTS.md has no hand-tick step
- [x] The desktop app shows the change like other tracker writes

## Answer

Built in 421f519 and 802e942. New `dryland ticket tick <map>/<NN> --criterion <n>` (1-based, counts ticked and unticked boxes under the 'Acceptance criteria' heading; errors for out-of-range, non-number, already ticked, no list) and `ticket resolve --amend` (replaces the ## Answer of a resolved ticket; errors if the ticket is open or has no Answer section). Both go through writeTracker (lock, scoped commit); commit messages 'Tick criterion N of map/NN' and 'Amend answer of map/NN'. Without --amend, resolving a resolved ticket still fails, now hinting at --amend. docs/agents/issue-tracker.md defines Tick and Amend, AGENTS.md step 1 uses the verb, manual updated, GLOSSARY.md defines Acceptance criterion and Amend (dc9ef4a). CLI tests cover each verb including 6 parallel ticks; full suite passes on Windows and Linux; desktop Playwright passes natively and on Linux (46 tests). Known limits: GitHub/GitLab trackers reject both verbs with a clear message (out of scope, no backend method added); no parallel-amend test; the desktop criterion rests on the generic ticket.changed live event both verbs emit (no desktop code changed, no e2e test exercises tick or amend, file-watcher refresh not separately verified).
