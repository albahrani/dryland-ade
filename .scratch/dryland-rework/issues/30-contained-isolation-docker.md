# Contained isolation (Docker)

Type: task
Status: ready-for-agent
Blocked by: 29, 39

## Question

**What to build:** Run the agent CLI in a Docker container mounting only the session worktree, with state outside the mount. A worktree's `.git` points outside the mount, so git needs the approach ticket 39 settles.

- [ ] Optional egress allowlist
- [ ] Container gets only the CLI's own auth
- [ ] Tested in the Linux container script; without Docker, noted and left to CI
