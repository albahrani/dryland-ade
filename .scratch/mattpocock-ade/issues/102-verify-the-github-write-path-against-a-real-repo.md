# Verify the GitHub write path against a real repo

Type: task
Status: resolved

## Question

ticket 46 was tested against a fake gh only. On a throwaway GitHub repo with a map-labelled issue, check that sub_issue_id and issue_id take the database id, that labels are created on issue create, that DELETE with assignees[] fields works, and that assignees[0] is the earliest claim. Fix the backend where a guess was wrong. Raised in review of ticket 46.

## Answer

Verified by running the dryland CLI against a throwaway private GitHub repo with a map-labelled issue (albahrani/dryland-verify-102, kept for ticket 113). Confirmed with no code change: sub_issue_id and issue_id take the issue database id (create under a map, block, unblock and re-block all applied); the type:task label is created on issue create; DELETE with assignees[] fields releases the claim; claim, comment, triage (swaps the role label), resolve (writes ## Answer and closes) and map index behave as ticket 46 describes. Not verified: that assignees[0] is the earliest claim, because it needs a second GitHub user; split off as mattpocock-ade/113. gh as installed on the maintainer's Windows host.
