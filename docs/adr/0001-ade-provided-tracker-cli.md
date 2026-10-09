# ADE-provided tracker CLI is the single write path for tickets

Agents work around mechanisms they don't understand, so concurrent edits to ticket files (claims, resolutions, map index) cannot be protected by the ADE watching from outside. We ship a CLI (`ade`) that is the only write path for tickets and the map index, delegating to local-markdown, GitHub (`gh`) and GitLab (`glab`) backends, and register it with `setup-matt-pocock-skills` through its "Other" tracker option so `docs/agents/issue-tracker.md` instructs agents to use it. Plain native trackers stay supported in lens mode (read and launch only, best-effort claims).

## Consequences

- Local-markdown tracker state lives only in the main checkout; the CLI finds it from any worktree via git's common dir and writes atomically under a lock.
- Every mutating command commits only its own tracker paths (pathspec commit, descriptive message); on commit failure the change stays on disk and the CLI warns. Opt-out setting.
- The CLI is standalone (no running app required) and is put on `PATH` for sessions the ADE spawns.
- Skills depend on the CLI being present: if missing, the agent stops and tells the user instead of editing files directly.
- Prose files (`GLOSSARY.md`, ADRs, specs) stay ordinary git files edited per worktree and merged by git.
