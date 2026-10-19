# Verify the GitHub write path against a real repo

Type: task

## Question

ticket 46 was tested against a fake gh only. On a throwaway GitHub repo with a map-labelled issue, check that sub_issue_id and issue_id take the database id, that labels are created on issue create, that DELETE with assignees[] fields works, and that assignees[0] is the earliest claim. Fix the backend where a guess was wrong. Raised in review of ticket 46.
