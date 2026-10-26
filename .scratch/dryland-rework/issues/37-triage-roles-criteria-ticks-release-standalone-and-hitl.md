# Triage roles, criteria ticks, release, standalone tickets and HITL

Type: task
Status: ready-for-agent
Blocked by: 15

## Question

**What to build:** the engine commands the old tracker had and the spec still needs, which no other ticket builds: triage, acceptance-criteria ticks, release of a stale claim, tickets without a map, and the flag that marks a ticket human-in-the-loop. Migration (ticket 32) carries triage roles and ticks over, and ticket 21 gates on HITL, so both need these first.

- [ ] `ticket triage` sets one of the five triage roles; the role shows in the UI
- [ ] A ticket holds acceptance criteria; `ticket tick` ticks the nth, and the UI shows ticks
- [ ] `ticket release` frees a claim, and a stale claim is shown as such
- [ ] A standalone ticket can be created without a map
- [ ] A ticket can be marked HITL at creation; how it is marked is recorded in an ADR amendment, since ADR 0011 names the gate but no field
- [ ] ADRs and glossary amended in the same commit if this slice finds them wrong
- [ ] Covered by tests at the CLI seam (and Playwright e2e where UI is touched); pnpm test and pnpm test:linux pass
