# Parallel work and shared-state strategy

Type: grilling
Status: resolved
Blocked by: 01, 02

## Question

Define the worktree/branch strategy letting many sessions work on tickets, grills and maps in parallel without concurrent-write problems. Where does shared state (esp. local-markdown ticket claims/status) live so it is consistent for all sessions and the UI (e.g. main branch)? How do claims, resolutions and map updates propagate and merge? How does this differ for GitHub/GitLab trackers?

## Answer

Settled by grilling; full rationale in [ADR 0001](../../../docs/adr/0001-ade-provided-tracker-cli.md).

- **ADE tracker**: the ADE ships a standalone CLI (`ade`) as the only write path for tickets and map index (claim/release/resolve/create/block/map index), delegating to local-markdown, `gh`, `glab`. Registered via setup-matt-pocock-skills' "Other" tracker; generated `issue-tracker.md` says never edit tracker files directly; if `ade` is missing, stop and tell the user. Plain native trackers stay supported in lens mode (best-effort).
- **Channel**: plain CLI on PATH (no MCP). ADE injects its bin dir into PTYs it spawns; optional install-to-PATH for outside terminals.
- **State**: local-markdown tracker files live only in the main checkout, found from any worktree via `git rev-parse --git-common-dir`; atomic writes under a lock; `create` allocates NN under the lock. Claims record holder (branch/session id) + timestamp; `ade ticket release` and an ADE action release stale claims. ADE warns if main checkout is not on the default branch.
- **Commits**: every mutating command commits only its own tracker paths (pathspec commit, descriptive message), default on, opt-out; on failure the change stays on disk and the CLI warns.
- **Worktrees**: one per ticket, `<effort>/<NN>-<slug>`, for planning and implementation sessions alike; ticketless sessions use `<effort>/scratch-<slug>`. `ade ticket resolve` writes straight to main (authoritative); git overlay (branch/PR open/merged) is displayed beside it. `ade worktree prune` removes worktree+branch only if ticket resolved, branch merged or empty, worktree clean, no session attached; confirmed in ADE, `--yes` in CLI; `resolve` never deletes.
- **Prose files** (GLOSSARY, ADRs, specs): ordinary git files edited per worktree, merged by git; ADE surfaces conflicts, no locking.
- **GitHub/GitLab**: same `ade` CLI fronts `gh`/`glab`: claim = assignee, blocking = native dependencies where available, map index = map issue body; ADE polls on focus/timer, no webhooks.
- **Parked**: CLI-to-ADE live reporting (`--attach`) and product naming became fog items on the map.
