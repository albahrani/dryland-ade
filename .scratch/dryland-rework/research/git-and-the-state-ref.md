# Git inside the sandbox with the state ref outside

Findings of ticket 39. Throwaway scripts ran on git 2.55 (Windows) and Docker 29 with the stock `node:24` image; they are not kept.

## Recommendation

1. **Move the store out of the repo's git dir.** State lives in its own bare git dir, outside the repo and every worktree (for example `<user data>/dryland/state/<repo-id>.git`). The engine addresses it with `GIT_DIR`. Nothing in the repo's refs, config or object store mentions it, so no git command run in a worktree touches it by accident. A deny set cannot make the ref safe where it is; see Guarded.
2. **Guarded**: deny the store's path (Read, Edit and, where the CLI can, Bash) as defence in depth. It is a speed bump against a determined agent, not a guarantee, which matches Guarded being the weaker level. Normal git use costs nothing: no git subcommand is denied.
3. **Contained**: mount a clone with its own object store instead of the worktree. Git works fully inside; the engine fetches the session branch out of the clone.

## Guarded: the deny set is not enough where the ref is today

From a linked worktree, with `refs/dryland/state` in the common dir, every route below changed or deleted the ref (also after `git pack-refs --all`, so `packed-refs` is no extra barrier):

| Route | Writes the ref |
| --- | --- |
| `git update-ref`, `update-ref -d`, `update-ref --stdin` | yes |
| `git push . <sha>:refs/dryland/state`, `push . --delete` | yes |
| `git fetch . +<sha>:refs/dryland/state` | yes |
| `git symbolic-ref refs/dryland/state ...` | yes |
| `git fast-import` (`reset refs/dryland/state`) | yes |
| `git -c alias.x='update-ref ...' x` | yes |
| `git --git-dir=<common> update-ref ...` | yes |
| writing or deleting `<common>/refs/dryland/state` and editing `packed-refs` with any shell tool | yes |

The same run in a `node:24` container (git 2.39.5, Linux) gave identical results, so the table holds on both platforms.

Consequences:

- Subcommand deny rules (`Bash(git update-ref:*)`) cover one row. `push`, `fetch`, `symbolic-ref`, `fast-import` and aliases do the same job, and denying `push` or `fetch` costs normal use. Rules match command text, so `git -c`, `git --git-dir`, `bash -c`, scripts and `node -e` slip past.
- Path deny rules do not help either: `<common>/refs/` and `packed-refs` must stay writable because branches, tags and commits live there, and `refs/dryland/**` cannot be denied apart from them when git itself is the writer.
- Not verified against current Claude Code and Copilot CLI docs: as far as I know, their path rules apply to the CLI's own file tools, and only an OS sandbox (not available on native Windows) constrains child processes. Re-check when ticket 28 builds the translation.
- Rolling back from the log (ADR 0013's violation handling) still works as a detector, but it reverts after the fact.

Host-side hygiene that stays regardless: the engine never runs `git` in the store with a worktree's environment, and clears `GIT_DIR`, `GIT_*` and `core.hooksPath` inherited from an agent's session.

## Separate store: what was checked

- A bare dir with its own `refs/heads/state` is invisible from a worktree: `for-each-ref` lists only branches, `cat-file -e <state commit>` fails, config has no mention, and commits in the worktree work normally.
- The repo's object store has no alternates, so no state object can be read through it.
- The agent can still harm it only by knowing the path and writing the dir directly, which the Guarded path deny and Contained's mount boundary cover.

Cost, and what changes in ticket 14's code (`packages/core/src/state-store.ts`):

- `runGit(cwd, ...)` for store operations takes `GIT_DIR=<store>` instead of using the repo; the repo's cwd is then only used to find the store. `STATE_REF` may become `refs/heads/state` or stay as is; there is no reason to change it.
- A `storeDir(cwd)` replaces `commonDir(cwd)` as the anchor. The store path is derived from a repo id (a hash of the real common dir path; the root commit id is stable across clones but breaks on history rewrites) and recorded in the user data dir, not in the repo, so a worktree cannot read it from its config.
- `cachePath` moves beside the store: the cache in the common dir is writable by the agent, which could poison it.
- `isStoreInitialised` and `initStore` run against the store; `dryland init` creates the bare dir.
- The ADR 0010 session index also sits in the common dir today. It holds no ticket state but does hold session tokens: it moves beside the store too.
- Loses: the store no longer travels with `git worktree`/repo moves, and a moved repo needs `dryland state` to re-bind it. `git clone` never copied `refs/dryland/*` anyway; sharing goes through the state remote of ADR 0012, which pushes from the store dir.

## Contained: git with only a clone mounted

Built and run: `git clone --no-local --no-hardlinks <repo> ctr`, `git remote remove origin`, `git checkout -b session-N`, mount `ctr` alone at `/work` in `node:24`.

- The clone has its own `.git`, no remotes and no alternates, so git works with nothing outside the mount. `add`, `commit`, `log` ran in the container. The `node:24` image carries git; `node:24-slim` does not.
- The state commit is absent from the clone (`cat-file -e` fails) and `fetch <clone> refs/dryland/state` finds nothing. A `git update-ref refs/dryland/state` in the container only writes the clone.
- Hand-back: the engine runs `git fetch <clone> +refs/heads/session-N:refs/dryland/sessions/N` in the main repo (or the state-neutral branch namespace it prefers) and merges as it does today. It must pass `-c safe.directory=*` for the clone, since the container user owns the files, and it should fetch only named branch refs, never run anything from the clone's config or hooks.
- Costs: one full clone per session instead of one worktree (a full object copy; `--no-local` avoids hardlinks into the host store, so there is no shared writable inode). Fast for small repos here (0.1 s, 87 KB); large repos cost size and time, and a partial or shallow clone (`--depth`, `--filter=blob:none`) is the lever. The agent sees all branches' history (the clone holds what the engine cloned; clone a single branch to narrow). Work in the worktree and work in the clone are different checkouts: the engine syncs by fetch, and a session cannot see unpushed host work unless the engine fetches it in.
- The container user's uid differs from the host's on Linux/macOS; run with `--user` or accept `safe.directory`.

## Replaces the "Open" consequences

- ADR 0012: state lives in a bare git dir outside the repo, so a linked worktree's `update-ref` cannot reach it.
- ADR 0013: Guarded denies the store path on top of that; Contained mounts a clone, not the common dir, and the engine fetches from it.

Open for the build tickets: the repo-id scheme, where the store sits on each OS, whether the store should be a bare repo or a worktree-less non-bare one (bare assumed), shallow-clone defaults for big repos.
