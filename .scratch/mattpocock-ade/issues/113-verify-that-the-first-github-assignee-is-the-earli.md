# Verify that the first GitHub assignee is the earliest claim

Type: task
Status: ready-for-human

## Question

Ticket 102 verified the GitHub write path on a real repo except one check, which needs a second GitHub user: that assignees[0] is the earliest claim, which the claim race check in packages/core/src/github-write.ts relies on. With a second account (a collaborator on a throwaway repo), have both claim the same issue at nearly the same moment and check that the loser is told who won and ends up unassigned, and that GitHub lists the first claimant first. Fix claimGithubTicket if the order is not what it assumes.
