# Caps, lint and one resolve per session

Type: task
Status: resolved
Blocked by: 45

## Question

**What to build:** the first new rules on the store tickets 41 to 44 built: field caps, lint, and the session gates on resolve. Claim itself exists from ticket 43.

- [x] Title, solution summary and Report have caps; over-cap text is rejected with the cap stated, never truncated, and the title cap applies to `ticket create` too, which ticket 14 left uncapped
- [x] Lint hits (hedges, filler, long sentences, paths, line numbers, bare ids) are rejected with the rule stated
- [x] The caller is identified by its session id from the environment; per-session tokens come with ticket 28
- [x] Resolve needs the caller's claim and a summary within caps; one resolve per session (research excepted)
- [x] The desktop shows the solution summary and shows a rejection's text

## Answer

Built in cbabb7a and 4fab9fc. `content-rules.ts` holds the caps (title 60, Report 1200, solution summary 600) and the lint (hedge, filler, sentences over 30 words, file path, line number, bare id); `checkProse` returns one diagnostic per problem, rule id and cap stated, and nothing is truncated. The title and Report caps and lint apply to `ticket create` (check step, exit 4); the summary is checked on `resolve` and `resolve --amend`. The caller's session id comes from `DRYLAND_SESSION_ID` or the Agent CLI's session variable. A caller with a session needs a claim made by that session (a claim with no session matches by branch) and resolves one non-research ticket per session; `ticket.resolved` now records the session (`resolvedBy`, cache version 4). A caller with no session, a person, is not gated. The desktop labels the answer "Solution summary" and `dryland-cli` now carries the diagnostic lines into the notice, so a rejection shows its text.

Known limits: lint is regex heuristics and may reject legitimate text (tune in use); caps and lint cover title, Report and summary only, not comments, fog or map text; an agent with no detectable session id counts as a person; amend has no actor gate; the desktop has no live counter. Tests: `pnpm test`, `pnpm test:linux`, desktop e2e native and Linux (43 each) green. Review: findings fixed were claim matching by session id and a dead test expression; ADR number updates not made.
