# Session-state channel

Type: task
Status: ready-for-agent
Blocked by: 40

## Question

**What to build:** the hook-fed session states (running, waiting, idle, ended) as their own channel, feeding badges, waiting counts, waiting-first ranking and the session index. The deletions that used to be here moved to ticket 40.

- [ ] Schema is session id, state, timestamp; unknown states are rejected
- [ ] Claude Code and Copilot hooks send it, and badges, waiting counts, waiting-first ranking and the session index `lastState` read it
- [ ] A Live event in the code and glossary means a session state report
- [ ] doctor reports missing hooks as an error
