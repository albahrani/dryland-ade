# Verify GitLab Premium issue links and the member plan view

Type: task
Status: ready-for-human

## Question

Ticket 103 verified the GitLab write path on a free personal project. Not verified, because they need a Premium namespace (a trial works) and, for the last, a second non-owner member: (1) that namespaces/:id reports a Premium plan value that PREMIUM_PLANS in packages/core/src/gitlab-backend.ts accepts; (2) that the issue links POST and DELETE take target_project_id, target_issue_iid and issue_link_id as used, and that blocking then uses native links instead of the Blocked by body line; (3) what a non-owner member sees on namespaces/:id. Fix the backend where a guess was wrong. Free-tier facts already known: namespaces/albahrani reports plan free.
