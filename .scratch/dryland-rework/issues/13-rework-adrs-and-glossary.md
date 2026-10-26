# Rework ADRs and glossary

Type: task
Status: resolved

## Question

**What to build:** the five new ADRs, header notes on the old ones (body untouched) and the glossary changes, so every later slice follows the new language and decisions.

- [ ] Five new ADRs: engine owns structured state; event log on a dedicated ref with optional state remote; isolation ladder and access requests; prompts from a pinned upstream snapshot through overlays; CLI surface and session-state channel
- [ ] Header notes mark 0001, 0003, 0008, 0009 superseded and 0004, 0005, 0006, 0007, 0010 amended; 0002 wording fixed
- [ ] Glossary: remove, redefine and add the terms listed in the spec
- [ ] Grep for removed terms finds nothing outside old ADR bodies

## Answer

Added ADRs 0011 to 0015 (engine owns state, event log and state remote, isolation ladder, prompts from pinned snapshot, CLI surface and session-state channel). Header notes: 0001, 0003, 0008, 0009 superseded; 0004 to 0007 and 0010 amended; 0002 wording fixed. Glossary: removed eight terms, redefined Live event, Ticket, Map, Fog item, Claim, Amend, Skill workflow, Ticket status, Agent adapter, Main checkout, added Report, Analysis log, Description, Solution summary, Revision, Author kind, Reopen, Unslop, Suggest (the other new terms already existed). Commit 839631e. Removed terms remain only in old ADR bodies, earlier specs and tickets, and code that later tickets delete. I also dropped 'ADE tracker' from docs/agents/issue-tracker.md. Criteria could not be ticked: the ticket has no Acceptance criteria heading.
