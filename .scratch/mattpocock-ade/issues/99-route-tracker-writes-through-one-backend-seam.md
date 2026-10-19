# Share the code the GitHub and GitLab backends duplicate

Type: task
Status: ready-for-agent

## Question

Ticket 47 added the `RemoteBackend` seam (`tracker-backend.ts`) and moved the triage-role and blocker checks to `tracker-rules.ts`, which was most of what this ticket first asked for. What remains is the code `github-write.ts` / `github-backend.ts` and `gitlab-write.ts` / `gitlab-backend.ts` still copy from each other: `ticketNamed` and `nameOf`, `afterCreate`, the `## Answer` stub fill in resolve, the `explainFailure` probe (`--version`, `auth status`, last stderr lines) with its two error messages, the create-input type declared in three places, and the claim and release state checks. Share what has one shape and leave per-tracker calls apart. Raised in review of ticket 46, narrowed after ticket 47.
