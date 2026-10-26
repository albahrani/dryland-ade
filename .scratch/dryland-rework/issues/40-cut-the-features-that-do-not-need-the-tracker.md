# Cut the features that do not need the tracker

Type: task
Status: resolved
Blocked by: none

## Question

**What to build:** delete what the spec cuts and the tracker flip does not touch, so tickets 41 to 45 work on a smaller app. This is the cut half of old ticket 25; the session-state schema stays with ticket 25.

- [x] Codex and Gemini adapters, their config and the auto-submit path are removed; only Claude Code and Copilot CLI adapters remain
- [x] PTY output guessing, `statusApproximate`, `session.started` and hand-started adoption are removed
- [x] The live-events panel, its IPC and its e2e spec are removed
- [x] Hook-fed status still drives the session badges and the sessions view unchanged
- [x] `ticket.changed` and the lock file stay: the state-ref watcher of ticket 42 replaces the first and ticket 45 removes both
- [x] Tests, fixtures and docs of the removed paths are deleted

## Answer

Built: the Codex and Gemini adapters, the adapter `tier` and `hasStatusHooks`, auto-submit (setting, per-project override, pre-typer Enter), `activity-status` and `statusApproximate`, the `session.started` kind, `adoptManual` with the `manual` flag, and the live-events panel with its IPC, setting and e2e spec are removed, with their tests. Claude Code and Copilot CLI remain; hook-fed status is untouched. `ticket.changed`, the live listener and its lock file stay.

Commits: 5fc227e (the cut), then three small follow-ups (dead `observe`, stale Codex and Gemini shims, the e2e spec for hand-started sessions).

Decisions: the hand-started path also took the launcher's per-CLI shims, `dryland agent-prepare` and `withoutPathDir` with it, since only adoption used them; the app deletes shims an earlier version left in its `bin` directory at start. A plain terminal no longer gets `DRYLAND_PANE_KEY` or `DRYLAND_HOOKS_DIR`, so a CLI run by hand there reports nothing.

Known limits: ADRs 0005 and 0006 and the glossary entry "Live event" still describe the removed paths (`DRYLAND_PANE_KEY` gate, best-effort tier, "no payload"); ticket 45 or the final sweep (35) should amend them. `initialPrompt: "pre-type"` is now a single-valued option, left as is. Playwright e2e passed natively (the full suite before the removed spec, `start-work.spec.ts` after); `pnpm test` and `pnpm test:linux` passed, `pnpm test:e2e:linux` was not run.
