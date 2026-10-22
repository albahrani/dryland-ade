# Share the code the GitHub and GitLab backends duplicate

Type: task
Status: resolved

## Question

Ticket 47 added the `RemoteBackend` seam (`tracker-backend.ts`) and moved the triage-role and blocker checks to `tracker-rules.ts`, which was most of what this ticket first asked for. What remains is the code `github-write.ts` / `github-backend.ts` and `gitlab-write.ts` / `gitlab-backend.ts` still copy from each other: `ticketNamed` and `nameOf`, `afterCreate`, the `## Answer` stub fill in resolve, the `explainFailure` probe (`--version`, `auth status`, last stderr lines) with its two error messages, the create-input type declared in three places, and the claim and release state checks. Share what has one shape and leave per-tracker calls apart. Raised in review of ticket 46, narrowed after ticket 47.

## Answer

Shared in 35114a4 and 91cf40a. New tracker-cli.ts holds the explainFailure probe and its messages for gh and glab. tracker-rules.ts now holds ticketNamed, nameOf, afterCreate, decideClaim, assertClaimed/assertClaimedBy, assertCanResolve, withAnswer and the single TrackerCreateInput type, replacing the copies in github-write/gitlab-write and the inline type in tracker-backend. Per-tracker calls stay apart. Messages and check order are unchanged; review caught a release-order change, fixed in 91cf40a. Full suite passes (791); the Linux Docker run was not done. Known limit: tracker-rules.ts now does some I/O (ticketNamed) and body editing (withAnswer), beyond its original rules-only role.
