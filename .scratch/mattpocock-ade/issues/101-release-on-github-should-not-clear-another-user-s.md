# Release on GitHub should not clear another user's claim

Type: task

## Question

releaseGithubTicket removes every assignee without checking who holds the issue, and resolveGithubTicket leaves the assignee set while returning claimant null. Decide and implement: release only the caller's own assignment (or refuse and name the holder), and clear the assignee on resolve if that is wanted. Add tests. Raised in review of ticket 46.
