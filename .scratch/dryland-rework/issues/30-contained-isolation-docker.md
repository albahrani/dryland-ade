# Contained isolation (Docker)

Type: task
Status: ready-for-agent
Blocked by: 29, 39

## Question

**What to build:** Run the agent CLI in a Docker container mounting only the session worktree, with state outside the mount. A worktree's `.git` points outside the mount, so per ticket 39 the container gets a clone with its own object store and no remotes instead.

- [ ] The session clone (`--no-local --no-hardlinks`, origin removed) is the only mount; git add and commit work inside; the state commit is absent from it
- [ ] The engine fetches the session branch out of the clone by named ref only, with `safe.directory` set for the container user, and runs nothing from the clone's config or hooks
- [ ] Clone size and time on a large repo are measured, with shallow or partial clone as the default lever
- [ ] Optional egress allowlist
- [ ] Container gets only the CLI's own auth
- [ ] Tested in the Linux container script; without Docker, noted and left to CI
