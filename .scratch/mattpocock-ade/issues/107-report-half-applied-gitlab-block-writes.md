# Report half-applied GitLab block writes

Type: task
Status: resolved

## Question

blockGitlabTicket with native links makes one call per added blocker and per removed link; a failure partway (or a missing link mid-removal) leaves earlier changes applied and the error does not say so. Name what was applied and the next action, with tests, as blockGithubTicket now does (ticket 100). Read the links and fetch everything before the first write where possible. Move the shared partlyApplied helper from github-write.ts into tracker-rules.ts so both backends use it, and consider folding afterCreate into it. GitLab triage is a single PUT and needs no change. Raised while checking ticket 100.

## Answer

blockGitlabTicket on a Premium namespace now reports a half-applied write: the error names what was already applied (e.g. 'blocked by #4') and the next action (re-run dryland ticket block), via the partlyApplied helper, which moved from github-write.ts to tracker-rules.ts and is shared by both backends. The links to remove are now found before the first write, so a missing link fails with nothing changed. A first-call failure is reported unchanged. Commit 4749df6, with three tests in gitlab-backend.test.ts (the fake glab gained a failing list). Decision: afterCreate was not folded into partlyApplied, as its message ('Issue #N was created, but ...') and next action differ. Limit: the missing-link-before-write path has no test, as it is reachable only by a race between the two reads. GitLab triage is a single PUT and unchanged.
