# Access requests

Type: task
Status: ready-for-agent
Blocked by: 28

## Question

**What to build:** An agent can ask for extra access with a reason; the user answers deny, deny and never ask, allow once, session or always.

- [ ] One rule store translated into each CLI's native rules, checked against the current Claude Code and Copilot CLI rule formats first
- [ ] Repo layer can only narrow; settings screen lists and revokes
- [ ] AFK: pre-approval at launch, denial ends the agent blocked without workarounds, request recorded on the ticket
- [ ] ADRs and glossary amended in the same commit if this slice finds them wrong
- [ ] Covered by tests at the CLI seam (and Playwright e2e where UI is touched); pnpm test and pnpm test:linux pass
