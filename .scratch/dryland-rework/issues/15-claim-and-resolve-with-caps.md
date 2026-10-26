# Caps, lint and one resolve per session

Type: task
Status: ready-for-agent
Blocked by: 45

## Question

**What to build:** the first new rules on the store tickets 41 to 44 built: field caps, lint, and the session gates on resolve. Claim itself exists from ticket 43.

- [ ] Title, solution summary and Report have caps; over-cap text is rejected with the cap stated, never truncated, and the title cap applies to `ticket create` too, which ticket 14 left uncapped
- [ ] Lint hits (hedges, filler, long sentences, paths, line numbers, bare ids) are rejected with the rule stated
- [ ] The caller is identified by its session id from the environment; per-session tokens come with ticket 28
- [ ] Resolve needs the caller's claim and a summary within caps; one resolve per session (research excepted)
- [ ] The desktop shows the solution summary and shows a rejection's text
