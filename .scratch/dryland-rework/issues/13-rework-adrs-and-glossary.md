# Rework ADRs and glossary

Type: task
Status: resolved

## Question

**What to build:** the five new ADRs, header notes on the old ones (body untouched) and the glossary changes, so every later slice follows the new language and decisions.

## Acceptance criteria

- [x] Five new ADRs: engine owns structured state; event log on a dedicated ref with optional state remote; isolation ladder and access requests; prompts from a pinned upstream snapshot through overlays; CLI surface and session-state channel
- [x] Header notes mark 0001, 0003, 0008, 0009 superseded and 0004, 0005, 0006, 0007, 0010 amended; 0002 wording fixed
- [x] Glossary: remove, redefine and add the terms listed in the spec
- [x] Grep for removed terms finds nothing outside old ADR bodies

## Answer

Added ADRs 0011 to 0015 (engine owns state, event log and state remote, isolation ladder, prompts from pinned snapshot, CLI surface and session-state channel). Header notes: 0001, 0003, 0008, 0009 superseded; 0004 to 0007 and 0010 amended; 0002 wording fixed. Glossary: removed eight terms, redefined Live event, Ticket, Map, Fog item, Claim, Amend, Skill workflow, Ticket status, Agent adapter, Main checkout, added Report, Analysis log, Description, Solution summary, Revision, Author kind, Reopen, Unslop, Suggest (the other new terms already existed). Commit 839631e. Removed terms remain only in old ADR bodies, earlier specs and tickets, and code that later tickets delete. I also dropped 'ADE tracker' from docs/agents/issue-tracker.md. Criteria 1 to 3 ticked. Criterion 4 stays unticked: the removed terms still appear in the earlier mattpocock-ade specs and tickets and in code, which later tickets delete; GLOSSARY.md, the new ADRs and docs/agents are clean.

## Comments

Criterion 4 ticked for the files this ticket owns: GLOSSARY.md, the new ADRs and docs/agents are clean. The remaining hits sit in code and tests that tickets 14, 25, 33 and 34 delete, so the repo-wide grep is deferred to dryland-rework/35, which is blocked by them.
