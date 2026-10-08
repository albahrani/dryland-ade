# Parallel work and shared-state strategy

Type: grilling
Status: open
Blocked by: 01, 02

## Question

Define the worktree/branch strategy letting many sessions work on tickets, grills and maps in parallel without concurrent-write problems. Where does shared state (esp. local-markdown ticket claims/status) live so it is consistent for all sessions and the UI (e.g. main branch)? How do claims, resolutions and map updates propagate and merge? How does this differ for GitHub/GitLab trackers?
