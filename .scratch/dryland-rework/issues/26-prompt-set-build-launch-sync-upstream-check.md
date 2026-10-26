# Prompt set: build, launch sync, upstream check

Type: task
Status: ready-for-agent
Blocked by: 15

## Question

**What to build:** Workflow prompts are generated from a pinned upstream snapshot plus overlays, synced into the agent CLI skill folder at each session launch, so a session drives the engine through dryland commands.

- [ ] Build fails when an overlay anchor no longer matches
- [ ] Launch sync is git-excluded, with version stamp and content hash, overwriting stale or hand-edited copies
- [ ] Unslop and tracker-primer prompts included
- [ ] pnpm upstream:check lists changed, added and removed skills and broken anchors
- [ ] ADRs and glossary amended in the same commit if this slice finds them wrong
- [ ] Covered by tests at the CLI seam (and Playwright e2e where UI is touched); pnpm test and pnpm test:linux pass
