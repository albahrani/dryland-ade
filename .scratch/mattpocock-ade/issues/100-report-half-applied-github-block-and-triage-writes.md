# Report half-applied GitHub block and triage writes

Type: task
Status: resolved

## Question

blockGithubTicket and triageGithubTicket make several gh calls; a failure partway leaves earlier calls applied (some dependencies added, or both triage labels present) and the error does not say so. Name what was applied and the next action, as createGithubTicket's afterCreate does, with tests. Raised in review of ticket 46.

## Answer

blockGithubTicket and triageGithubTicket now report a half-applied write: the error names what was already applied (e.g. 'blocked by #2', 'added the label "needs-info"') and the next action (re-run dryland ticket block, or remove the stale label by hand), via a local partlyApplied helper in github-write.ts. A first-call failure is reported unchanged, as nothing was applied. Block now reads all blocker issues before its first write, so only a write can leave a half-applied state. Commit 9259867, with three tests in github-write.test.ts. Limit: the GitLab write path was not in scope and is unchanged.
