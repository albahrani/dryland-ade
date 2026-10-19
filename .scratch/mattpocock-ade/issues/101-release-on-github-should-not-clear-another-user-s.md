# Release on GitHub should not clear another user's claim

Type: task
Status: resolved

## Question

releaseGithubTicket removes every assignee without checking who holds the issue, and resolveGithubTicket leaves the assignee set while returning claimant null. Decide and implement: release only the caller's own assignment (or refuse and name the holder), and clear the assignee on resolve if that is wanted. Add tests. Raised in review of ticket 46.

## Answer

Implemented in the commit before this one. releaseGithubTicket now reads the user's gh login and refuses when the claimant is someone else, naming the holder and the next action; it removes only the caller's own assignee, so GitHub and GitLab release the same way. Decision on resolve: the assignee stays set on a resolved issue (it records who did the work), and the read side already reports claimant null for resolved tickets, so no code change. Tests in core/test/github-write.test.ts cover releasing one's own claim and refusing another's with no write. Known limit: an issue assigned to several users is judged by the first assignee only. Not run: the code-review skill's sub-agents, as the change is about twenty lines; self-reviewed.
