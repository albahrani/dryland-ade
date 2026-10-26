# Git inside the sandbox with the state ref outside

Type: prototype
Status: resolved
Blocked by: 14

## Question

This runs first: if no deny set is enough, the store location changes, and tickets 41 onward build on it.

**Read first:** ADRs 0012 and 0013 (their "Open" consequences are what this ticket settles), ticket 14's Answer and the store code it built (`packages/core/src/state-store.ts`).

**What to build:** a throwaway prototype that answers one question before tickets 28 and 30 build on it: how can an agent run git in its worktree, including commits, when the state ref must be unwritable by it?

Facts checked while building ticket 14:

- The state ref sits in the repo's git common dir. A linked worktree shares that dir, and `git update-ref refs/dryland/state` succeeds from inside it. "Never checked out" keeps the state out of the working tree; it does not keep it out of reach of git.
- A commit in a linked worktree writes objects and refs into the common dir, so a file-level sandbox cannot deny the whole dir.
- Contained mode mounts only the worktree. Its `.git` file points at the common dir outside the mount, so git does not work in the container, and mounting the common dir would expose the state ref.

ADR 0012 ("no worktree or container mount contains state") and ADR 0013 ("in Contained, state is outside the mount") assume more than this holds.

- [x] Guarded: which deny rules (paths, git subcommands) block writes to `refs/dryland/**` and `packed-refs`, per Claude Code and Copilot CLI, and what they cost the agent's normal git use
- [x] Contained: a way to run git in the container without mounting the common dir (for example a clone with its own object store that the engine fetches from), and what it costs
- [x] The state store location changes (for example a separate git dir) if no deny set is enough, and what that changes in ticket 14's code
- [x] A recommendation, with the "Open" consequences of ADR 0012 and 0013 replaced by the result
- [x] Prototype code is thrown away; findings go in `.scratch/dryland-rework/research/`

## Answer

No deny set is enough: from a linked worktree 13 routes (update-ref, push ., fetch ., symbolic-ref, fast-import, aliases, --git-dir, plain file writes) rewrote the ref, on Windows git 2.55 and Linux git 2.39. The store moves to its own bare git dir outside the repo, addressed with GIT_DIR; Guarded also denies its path as defence in depth; Contained mounts a clone with its own object store and the engine fetches the session branch out of it. Findings in research/git-and-the-state-ref.md; ADRs 0012 and 0013 amended in bc3d98f. Known limits: Claude Code and Copilot CLI rule semantics were not checked against their docs (ticket 28 re-checks); the repo-id scheme, store location per OS and shallow-clone defaults are open for the build tickets; ticket 14's state-store.ts still uses the common dir until a build ticket moves it. No throwaway branch, per the map.
