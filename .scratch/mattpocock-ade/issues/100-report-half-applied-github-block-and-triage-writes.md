# Report half-applied GitHub block and triage writes

Type: task

## Question

blockGithubTicket and triageGithubTicket make several gh calls; a failure partway leaves earlier calls applied (some dependencies added, or both triage labels present) and the error does not say so. Name what was applied and the next action, as createGithubTicket's afterCreate does, with tests. Raised in review of ticket 46.
