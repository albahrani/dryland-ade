# Rework ADRs and glossary

Type: task
Status: claimed
<!-- dryland: {"claim":{"holder":"main","at":"2026-10-26T15:31:14.937Z","was":"ready-for-agent"}} -->

## Question

**What to build:** the five new ADRs, header notes on the old ones (body untouched) and the glossary changes, so every later slice follows the new language and decisions.

- [ ] Five new ADRs: engine owns structured state; event log on a dedicated ref with optional state remote; isolation ladder and access requests; prompts from a pinned upstream snapshot through overlays; CLI surface and session-state channel
- [ ] Header notes mark 0001, 0003, 0008, 0009 superseded and 0004, 0005, 0006, 0007, 0010 amended; 0002 wording fixed
- [ ] Glossary: remove, redefine and add the terms listed in the spec
- [ ] Grep for removed terms finds nothing outside old ADR bodies
