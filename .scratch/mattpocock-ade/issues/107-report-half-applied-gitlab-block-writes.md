# Report half-applied GitLab block writes

Type: task

## Question

blockGitlabTicket with native links makes one call per added blocker and per removed link; a failure partway (or a missing link mid-removal) leaves earlier changes applied and the error does not say so. Name what was applied and the next action, with tests, as blockGithubTicket now does (ticket 100). Read the links and fetch everything before the first write where possible. Move the shared partlyApplied helper from github-write.ts into tracker-rules.ts so both backends use it, and consider folding afterCreate into it. GitLab triage is a single PUT and needs no change. Raised while checking ticket 100.
