# GitHub and GitLab structured-data capabilities

Question: what structured data can GitHub and GitLab issues hold, and what do `gh` and `glab` expose versus raw API. Primary sources only (official docs, `gh` and `glab` manuals). Fetched 2026-10-25; both products change fast, so recheck before building.

Legend: **CLI** = native flag/subcommand; **API** = needs `gh api` / `glab api` (REST or GraphQL); **UI** = no documented API; **?** = not confirmed in the sources read.

## Comparison

| Capability | GitHub | gh | GitLab | glab |
|---|---|---|---|---|
| Issue types | Org-level, max 25 per org; defaults task, bug, feature [1]. REST create/update take `type` (name); needs push access, else silently dropped [2]. GraphQL `updateIssueIssueType`, `issueTypeId` on `UpdateIssueInput` [3] | CLI: `issue create/edit --type`, `--remove-type`; JSON field `issueType` [4][5][6] | `issue_type`: issue, incident, test_case, task (create defaults issue; update lists only issue/incident/test_case) [7]. Configurable custom types: Premium/Ultimate, max 40 per top-level group, GA 19.1, no API documented [8] | `issue list --issue-type` (issue, incident, test_case) [9]. No type flag on `create`/`update` [10][11]. Else `glab api` |
| Custom fields | Two systems. (a) Projects v2 fields: text, number, date, single select, iteration; max 50 fields per project [12]. (b) Org "issue fields": single-select, text, number, date; max 25 per org, 100 options, 50 per project [13]; REST `issue_field_values` on issue create/update, org-owned repos only [2] | (a) CLI: `project field-create/field-list/item-edit` (text, number, date, single-select, iteration, clear; one field per call; needs `project` scope) [14][15]. (b) API only (REST `issue_field_values` on create/update [2]) | Custom fields: Premium/Ultimate, GA 18.0; single-select, multi-select, number, text; 50 per top-level group, 10 per type, 50 options, text 1024 chars; set by Planner+ [16]. GraphQL `customField*` mutations exist [17]; REST not confirmed. Legacy per-issue fields: weight (Premium+), health_status (Ultimate) [7] | `issue update/create --weight` only [10][11]. Custom fields: API only (GraphQL) |
| Labels | Repo-scoped; write access creates/edits/deletes, triage applies; no documented size limits [18] | CLI: `issue create/edit --label`, `--add-label`, `--remove-label`; `label create/edit/delete/list/clone` [4][5][19] | Project, group, instance labels; scoped labels Premium+; 100 labels per item on GitLab.com; Planner+ manages [20]. REST `labels` (replace), `add_labels`, `remove_labels` [7]. Label add/remove history via `resource_label_events` [21] | CLI: `issue create --label`, `update --label/--unlabel`, `list --label/--not-label`; `label create/delete/edit/get/list` [10][11][22][9] |
| Sub-issues / hierarchy | Native: max 100 sub-issues per parent, 8 nesting levels [23]. REST: GET parent, GET/POST sub_issues, DELETE sub_issue, PATCH reprioritize; sub-issue must share the parent's repo owner; REST permissions not documented [24]. GraphQL `addSubIssue`, `removeSubIssue`, `Issue.subIssues` [3] | CLI: `issue create --parent`; `issue edit --parent/--remove-parent/--add-sub-issue/--remove-sub-issue`; JSON `parent`, `subIssues`, `subIssuesSummary` [4][5][6] | Child items: Free+; up to 5,000 direct children per parent (17.1+); epics nest 7 levels (multi-level is Ultimate); an issue has at most one epic; issue parents tasks; epic holds issues or child epics, not both [25]. Epic assignment on create via `--epic` | CLI: `issue create --epic` only [10]; `issue list --epic` (needs `--group`) [9]. Parent/child tasks: API |
| Dependencies / links | Native "blocked by"/"blocking" [26]. REST: list blocked_by/blocking, add/remove blocked_by (body `issue_id`, the numeric id) [27]. GraphQL `addBlockedBy`, `removeBlockedBy`, `Issue.blockedBy` [3]. Limits and permissions not documented | CLI: `issue create --blocked-by/--blocking`; `issue edit --add-blocked-by/--remove-blocked-by/--add-blocking/--remove-blocking`; JSON `blockedBy`, `blocking` [4][5][6] | Link types `relates_to`, `blocks`, `is_blocked_by`. **Tier: relates_to Free+; blocks/is_blocked_by Premium and Ultimate** [28][29]. Cross-project OK; Guest+ on both projects (was Reporter before 17.0); both issues must be visible to the viewer. REST `/projects/:id/issues/:iid/links` (`link_type`); create needs update rights on both issues [30]. No documented cap on link count | CLI: `issue create --linked-issues --link-type` only (create time) [10]. No link on `update`, no unlink. Else `glab api` |
| Comment edit | REST `PATCH /issues/comments/:id` (body), `DELETE`; GraphQL `updateIssueComment` [3][31]. Write access edits any comment [32] | CLI: `issue comment --edit-last`, `--delete-last` (own latest only) [33]. Others by ID: API | REST `PUT /projects/:id/issues/:iid/notes/:note_id`, `DELETE`; create has `internal` [34]. Own comments always; Maintainer/Owner edit others' [35]. Internal notes (Reporter+ view) cannot be converted to public [35]. Body is normalised (quick actions run and stripped) [34] | CLI: `issue note -m [--internal]` creates only [36]. No edit/delete/list-by-id: `glab api` |
| Comment hide / minimize | GraphQL `minimizeComment`, `unminimizeComment`; `IssueComment.isMinimized`, `minimizedReason` [3]. REST: not documented (comment objects carry a `minimized` field with reason) [31]. UI: org moderators and write access can hide [32] | None. `gh api graphql` | No hide/minimize found. Closest: delete, or internal note at creation (not retroactive) [34][35] | None |
| Issue body edit history | GraphQL `Issue.userContentEdits`, `IssueComment.userContentEdits` [3]. No REST endpoint [2]. UI: read access views comment history; author or write access can redact a revision (editor and time remain); max 100 edits kept (original plus latest 99) [37]. Issue-description history rules: page silent, limit assumed to apply [37] | None (not in `issue view --json` fields) [6]. `gh api graphql` | Description version history is **Premium and Ultimate** and shown in the UI with "Compare with previous version" [35]. REST/GraphQL access, permissions and deletion: not confirmed from docs read | None. Free tier: no history; only `system` notes ("changed the description") from notes API [34] |
| Rate / permission limits | See below | | See below | |

## Rate and permission limits

GitHub [38][39]:
- Primary: 5,000 requests/hour per user token (REST) or 5,000 points/hour (GraphQL); GitHub App installation scales 5,000 to 12,500; Actions `GITHUB_TOKEN` 1,000/hour per repo; Enterprise Cloud org apps get 15,000 (REST page) or 10,000 (GraphQL page). The two pages disagree; treat as unconfirmed.
- Secondary: 100 concurrent requests; 900 points/minute REST, 2,000 GraphQL; REST GET costs 1, writes cost 5; GraphQL mutation costs 5; about 80 content-creating requests/minute and 500/hour; sub-issue and dependency writes explicitly warn of secondary limiting [24][27]. GraphQL connections need `first`/`last` of 1 to 100.
- Permissions: `type`, `labels`, `assignees`, `milestone` are silently dropped on create/update without push access (no error) [2]. Issue update: owner, push, or Triage. Org issue-type management: org admin, `admin:org` scope [40]. Projects need the `project` scope for gh [14]. Projects v2 REST item API exists (list/add/get/PATCH/delete; fields by id; `null` clears) [41]; the GraphQL guide says `updateProjectV2ItemFieldValue` cannot set assignees, labels, milestone, repository [42]. Required REST scopes for sub-issues and dependencies: not documented [24][27].

GitLab [43][34]:
- GitLab.com authenticated API: current limit 2,000 requests/minute per user for all plans; proposed per-plan limits (Free 100, Premium 1,250, Ultimate 2,000/minute; hourly 5,000/15,000/25,000) are "not in effect yet" on that page. Issue creation 200/minute; note creation 60/minute (current). Link creation: no specific limit listed.
- Note body max 1,000,000 characters [34]. Text custom field value 1,024 chars [16]. Pagination over 10,000 records omits totals [44].
- Permissions: edit issue = Planner+ or author/assignee (Reporter before 17.7) [45]; labels Planner+ [20]; custom fields: Maintainer/Owner of the top-level group define them, Planner+ set values (Guest only at creation) [16]; links Guest+ on both sides [28].
- Several fields are tier-gated (weight, epic, iteration Premium+; health_status Ultimate) [7].

## What needs raw API

- GitHub: comment hide/minimize; body edit history; org issue fields; REST/GraphQL sub-issue reorder; editing or deleting a comment that is not your last one; Projects v2 labels/assignee fields; reading fields other than text/number/date/select/iteration.
- GitLab (glab): comment edit/delete; issue links after creation (add/remove/list); parent/child tasks; custom fields; issue type on create/update; description history; labels history; most work-item features.

## Notes for the decision

- GitHub is the richer structured model on a free account: types, sub-issues, dependencies and issue fields are all native. GitLab gates blocking links (Premium+), custom fields (Premium+), description history (Premium+), scoped labels (Premium+). A tracker design that needs those must degrade on GitLab Free (labels and `relates_to` links only).
- `gh` covers type, sub-issues, dependencies and Projects fields natively; `glab` covers little beyond labels and create-time links, so a GitLab backend leans on `glab api`.
- Silent drops on GitHub (type/labels without push access) mean writes must be read back to verify.
- Not confirmed from the primary sources read (flagged to recheck): GitLab GraphQL `updateNote` and `workItem*` mutations (the reference page was truncated by the fetch tool), GitLab REST/GraphQL for description versions (docs page returned an auth redirect), GitLab custom-field and custom-type REST support, GitHub REST permission scopes for sub-issues and dependencies, GitHub `UserContentEdit` field list.

## Sources

1. https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/managing-issue-types-in-an-organization
2. https://docs.github.com/en/rest/issues/issues
3. https://docs.github.com/en/graphql/reference/issues (mutations and Issue/IssueComment fields; listed in the GraphQL reference index https://docs.github.com/en/graphql/reference/mutations)
4. https://cli.github.com/manual/gh_issue_edit
5. https://cli.github.com/manual/gh_issue_create
6. https://cli.github.com/manual/gh_issue_view
7. https://docs.gitlab.com/api/issues/
8. https://docs.gitlab.com/user/work_items/configurable_work_item_types/
9. https://docs.gitlab.com/cli/issue/list/
10. https://docs.gitlab.com/cli/issue/create/
11. https://docs.gitlab.com/cli/issue/update/
12. https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects
13. https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/managing-issue-fields-in-your-organization
14. https://cli.github.com/manual/gh_project
15. https://cli.github.com/manual/gh_project_item-edit
16. https://docs.gitlab.com/user/work_items/custom_fields/
17. https://docs.gitlab.com/api/graphql/reference/mutations/ (customFieldArchive/Create/Unarchive/Update, createNote, destroyNote seen)
18. https://docs.github.com/en/issues/using-labels-and-milestones-to-track-work/managing-labels
19. https://cli.github.com/manual/gh_label
20. https://docs.gitlab.com/user/project/labels/
21. https://docs.gitlab.com/api/resource_label_events/
22. https://docs.gitlab.com/cli/label/
23. https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/adding-sub-issues
24. https://docs.github.com/en/rest/issues/sub-issues
25. https://docs.gitlab.com/user/work_items/child_items/
26. https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/creating-issue-dependencies
27. https://docs.github.com/en/rest/issues/issue-dependencies
28. https://docs.gitlab.com/user/project/issues/related_issues/
29. https://docs.gitlab.com/user/work_items/linked_items/
30. https://docs.gitlab.com/api/issue_links/
31. https://docs.github.com/en/rest/issues/comments
32. https://docs.github.com/en/communities/moderating-comments-and-conversations/managing-disruptive-comments
33. https://cli.github.com/manual/gh_issue_comment
34. https://docs.gitlab.com/api/notes/
35. https://docs.gitlab.com/user/discussions/
36. https://docs.gitlab.com/cli/issue/note/
37. https://docs.github.com/en/communities/moderating-comments-and-conversations/tracking-changes-in-a-comment
38. https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
39. https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api
40. https://docs.github.com/en/rest/orgs/issue-types
41. https://docs.github.com/en/rest/projects/items
42. https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects
43. https://docs.gitlab.com/user/gitlab_com/rate_limits/
44. https://docs.gitlab.com/api/rest/
45. https://docs.gitlab.com/user/project/issues/managing_issues/
