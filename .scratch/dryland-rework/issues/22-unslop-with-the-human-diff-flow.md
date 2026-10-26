# Unslop with the human diff flow

Type: task
Status: ready-for-agent
Blocked by: 21, 26

## Question

**What to build:** Unslop (a prompt from ticket 26's prompt set) proposes a denser rewrite; a human reviews a word-level diff and accepts or rejects; workflow-triggered runs apply without acceptance.

- [ ] Diff view with char count against cap and three ticks (clear, dense, nothing cut)
- [ ] Accept disabled until all ticked; Reject discards
- [ ] Agent or workflow runs skip the screen and show an agent-authored mark in History
- [ ] ADRs and glossary amended in the same commit if this slice finds them wrong
- [ ] Covered by tests at the CLI seam (and Playwright e2e where UI is touched); pnpm test and pnpm test:linux pass
