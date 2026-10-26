# Guarded isolation: no agent write path

Type: task
Status: ready-for-agent
Blocked by: 26, 39

## Question

**What to build:** In Guarded mode agents can write tracker state only through dryland commands with a per-session token; bypasses are reverted and recorded as violations. The store is a separate bare git dir after ticket 41, so a worktree's git cannot reach it; this ticket denies its path as defence in depth, building on ticket 39's findings.

- [ ] Direct writes to state denied through the CLI's own rules and hooks: the store path is denied per CLI, and the rule semantics ticket 39 could not check (do Claude Code and Copilot CLI path rules reach child processes, and on which OS) are verified against their docs and recorded in the doctor
- [ ] Detected bypass reverted from the log, violation event recorded, agent told in the next result, second violation pauses the session
- [ ] Profile derived from ticket type; secrets scrubbed from env
- [ ] UI shows violations
