# GitHub and GitLab structured-data capabilities

Type: research
Status: resolved

## Question

What structured data can GitHub and GitLab issues hold and expose through gh and glab: issue types, custom fields, labels, sub-issues, dependencies/links (including GitLab tier limits), comments edit/hide/minimize, issue body edit history, and rate or permission limits. The facts a storage and backend decision needs. Use primary sources.

## Answer

GitHub natively holds issue types, sub-issues (100 per parent, 8 levels), blocked-by dependencies and org issue fields, and gh exposes nearly all of it; comment hide and edit history need raw GraphQL. GitLab gates blocking links, custom fields, scoped labels and description history to Premium+, and glab exposes little beyond labels and create-time links, so it leans on glab api. Full comparison, limits and unconfirmed items in .scratch/dryland-rework/research/github-gitlab-structured-data.md.
