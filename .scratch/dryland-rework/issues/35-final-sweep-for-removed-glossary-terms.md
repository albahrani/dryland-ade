# Final sweep for removed glossary terms

Type: task
Status: ready-for-agent
Blocked by: 25, 33, 34, 45

## Question

**What to build:** re-run the grep that ticket 13 deferred, once the tickets that delete the old code have landed.

## Acceptance criteria

- [ ] Grep for the terms the glossary removed (best-effort tier, approximate status, auto-submit, skill setup state, compatibility verdict, ADE-owned annotation, ADE tracker, hand-started session) finds nothing outside old ADR bodies and the closed mattpocock-ade effort under .scratch
- [ ] Leftover hits in code, tests, fixtures or docs are removed or reworded, and any term that cannot go is explained in a comment on this ticket
