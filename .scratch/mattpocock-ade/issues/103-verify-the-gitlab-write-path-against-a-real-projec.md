# Verify the GitLab write path against a real project

Type: task

## Question

ticket 47 was tested against a fake glab only. On a throwaway GitLab project with a map-labelled issue, check that the :id placeholder resolves, that assignee_ids[] with a value and with 0 assigns and unassigns, that add_labels and remove_labels work and create missing labels, that issue creation with labels=map:1,type:task creates them, that a Premium namespace reports plan on namespaces/:id (and what a non-owner member sees), and that the links POST and DELETE take target_project_id, target_issue_iid and issue_link_id as used. Fix the backend where a guess was wrong. Raised in review of ticket 47.
