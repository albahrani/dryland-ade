# Verify the GitLab write path against a real project

Type: task
Status: resolved

## Question

ticket 47 was tested against a fake glab only. On a throwaway GitLab project with a map-labelled issue, check that the :id placeholder resolves, that assignee_ids[] with a value and with 0 assigns and unassigns, that add_labels and remove_labels work and create missing labels, that issue creation with labels=map:1,type:task creates them, that a Premium namespace reports plan on namespaces/:id (and what a non-owner member sees), and that the links POST and DELETE take target_project_id, target_issue_iid and issue_link_id as used. Fix the backend where a guess was wrong. Raised in review of ticket 47.

## Answer

Run with the dryland CLI against a throwaway private project on gitlab.com (albahrani/dryland-verify-103, kept for ticket 114), glab 1.124.0 on Windows. One guess was wrong and is fixed in 9947a2b: current glab refuses the field name assignee_ids[] in a JSON request body, so claim failed; assignee_ids is now sent as a JSON array with -F (assignee_ids=[42] assigns, [0] unassigns, both confirmed), and the test fake now refuses bracketed field names. Confirmed unchanged: the :id placeholder resolves; labels=map:1,type:task on create creates both labels; ticket create, claim, release, comment, triage (swaps the role label), resolve (closes), map index, and blocking through the Blocked by body line with block --add and --remove all work; namespaces/albahrani reports plan free. Not verified, split off as mattpocock-ade/114 because it needs Premium: the Premium plan value, the issue links POST and DELETE parameters, and what a non-owner member sees. Known limit: the -F JSON array form is untested on glab versions older than 1.124.0. Both Windows and Linux suites pass.
