# Storage format and where the truth lives

Type: grilling
Status: resolved
Blocked by: 01, 02, 07, 05

## Question

Decide where tickets, maps, fog, comments and revisions are stored and who holds the truth: is the repo still the source of truth, or does the engine keep its own store? Cover the effect on the local, GitHub and GitLab backends. Baselines: the engine-ownership and lifecycle decisions, the GitHub and GitLab capability research, and the sandbox rule that an agent has no write path to the state store (Contained needs the store outside the mount or read-only).

## Answer

Decision: the engine's state store is the only truth: an append-only log of immutable event files on a dedicated git ref (e.g. refs/dryland/state), never checked out, so outside every worktree and Contained mount. State is derived by replay into a disposable local SQLite cache; periodic snapshots bound replay; pruning is a manual user action only. Working tree holds no ticket files: read via ticket show and UI; dryland export renders read-only markdown, never a source. Prose files (GLOSSARY, ADRs, specs) stay ordinary files merged by git. Attachments (research, prototype assets) move into the store, size-capped, warned if the state remote is public. Sync: automatic fetch and push by default, setting for manual or off; a failed push never blocks a command. State remote is a per-repo setting: local-only (default), origin, or any other remote such as a private team repo; consent recorded per remote with the visibility downside stated; join via dryland state join <url>, URL never in the ref. Claims: first to reach the remote wins; offline claims are provisional; clashing events (double resolve) rejected at sync. Machine-local, never synced: cache, session index, lock, session tokens, isolation settings, transcripts. Forges (GitHub, GitLab) are reporting channels only: issues ingested idempotently as human-authored Reports linked by URL into needs-triage; claim, resolve and reopen post progress back; no two-way edits; forge tokens stay with the engine. Sandbox: store outside worktrees satisfies the no-write-path rule; Guarded relies on detect-and-revert from the log. Supersedes .scratch tickets, ADR 0009 annotation and ADR 0001's local-markdown backend; ADR 0010 index stays machine-local. Glossary: State store, Event, State remote added. Limits: prune protocol across clones, snapshot cadence, attachment caps, event schema left to spec; one ADR for the ref-based store to be written with the ADR set.
