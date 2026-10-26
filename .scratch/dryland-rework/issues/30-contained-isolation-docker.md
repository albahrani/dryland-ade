# Contained isolation (Docker)

Type: task
Status: ready-for-agent
Blocked by: 29

## Question

**What to build:** Run the agent CLI in a Docker container mounting only the session worktree, with state outside the mount.

- [ ] Optional egress allowlist
- [ ] Container gets only the CLI's own auth
- [ ] Tested in the Linux container script; without Docker, noted and left to CI
- [ ] ADRs and glossary amended in the same commit if this slice finds them wrong
- [ ] Covered by tests at the CLI seam (and Playwright e2e where UI is touched); pnpm test and pnpm test:linux pass
