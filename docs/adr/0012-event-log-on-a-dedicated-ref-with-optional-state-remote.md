# State is an event log on a dedicated git ref, with an optional state remote

The engine needs a store that is never part of a working tree, that merges across clones, and that keeps history. State is an append-only log of immutable event files on a dedicated ref (for example `refs/dryland/state`) that is never checked out. Current state is derived by replay into a disposable SQLite cache, bounded by periodic snapshots.

Rejected: a SQLite file as the store (does not merge, sits in a mount); state on the default branch (every worktree and container would hold it, and agents could edit it); forge issues as the store (two sources of truth, tier differences between GitHub and GitLab).

## Decisions

- **Machine-local, never synced**: the cache, the session index, session tokens, isolation settings and transcripts.
- **State remote**: chosen per repo. Local-only is the default; `origin` or another remote are opt-in. Consent is recorded per remote with the visibility downside stated. `dryland state join <url>` joins a team's state; the URL is not stored in the ref.
- **Sync**: automatic fetch and push by default, with manual and off settings. A failed push never blocks a command. First to the remote wins a claim, offline claims are provisional, and a double resolve is rejected at sync.
- **Pruning**: manual only. History is never lost automatically.
- **Attachments**: research and prototype assets live in the state store, size-capped, with a warning when the remote is public.
- **Export**: `dryland export` renders read-only markdown. It is never a source.
- **Forges** are reporting channels only. GitHub and GitLab issues are ingested idempotently, keyed by URL, as human-authored Reports in needs-triage. Claim, resolve and reopen are posted back to the issue. There are no two-way edits, and forge tokens stay with the engine.

## Consequences

- **Reachability: the store is its own bare git dir outside the repo.** "Never checked out" keeps state out of the files an agent edits, not out of reach of git: a linked worktree shares the git common dir, and update-ref, push, fetch, symbolic-ref, fast-import, aliases and plain file writes all change a ref there, so no deny set is enough. The dedicated ref therefore lives in a separate bare git dir (under the user data dir, keyed by repo), addressed by the engine with `GIT_DIR`; the cache and session index sit beside it. Findings: `.scratch/dryland-rework/research/git-and-the-state-ref.md`.

- **Placement (settled by dryland-rework ticket 41).**
  - *Bare:* the store is `git init --bare`, so it has no working tree and no index of its own; the engine writes with `GIT_DIR` set and a scratch `GIT_INDEX_FILE`.
  - *Repo id:* a random UUID, written at `dryland init` to the repo's own git config as `dryland.repoId`. Worktrees share it; a plain move of the repo keeps it, because the config travels with the `.git` dir.
  - *Path:* `<data dir>/stores/<repo id>.git`. The data dir is `DRYLAND_DATA_DIR` when set, else `%LOCALAPPDATA%\Dryland` on Windows, `~/Library/Application Support/Dryland` on macOS and `$XDG_DATA_HOME/dryland` (default `~/.local/share/dryland`) elsewhere. Nothing under it is inside a repo.
  - *Beside the store:* `dryland/cache.sqlite` and `dryland/sessions.json` (the ADR 0010 session index) sit in the store dir. A repo without a store keeps the index in its git common dir.
  - *Re-binding:* the store records the git common dir of the repo that owns it (`repo-path` in the store dir). A plain move leaves the recorded path gone, so the repo keeps its store and re-records itself. A copy carries the same id while the original still exists, so every command refuses it and says so. `dryland init --new-store` gives the copy an empty store of its own; `dryland init --bind <repo id>` binds it to an existing store on purpose.
- Supersedes ADR 0008's backend mapping: there is one ticket model and no per-forge claim or blocking mapping.
- The session index of ADR 0010 stays machine-local, now beside the cache.
- The event schema, snapshot cadence, prune protocol across clones and attachment caps are set during build.
