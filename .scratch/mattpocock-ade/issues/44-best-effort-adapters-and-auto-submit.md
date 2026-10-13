# Best-effort adapters and auto-submit

Type: task
Status: ready-for-agent
Blocked by: 36

Spec: [spec](../spec.md), user stories 43, 51, 52. "Agent adapters". ADR 0006.

## What to build

Agent CLIs beyond the two first-class ones, as best-effort adapter entries: launch plus pre-typed command, no status guarantee. Add entries for the commonly used CLIs whose launch and skill-command syntax are known (for example Codex CLI and Gemini CLI); each is one declarative entry. The config-table idea may follow Orca's, with MIT attribution recorded for `THIRD_PARTY_NOTICES`.

For CLIs without hooks, status comes from PTY heuristics (process alive, recent output) and is marked approximate wherever it is shown, so the user knows how much to trust it.

Also the opt-in auto-submit setting: when on, the pre-typed command is submitted. Off by default, global with a per-project override.

## Acceptance criteria

- [ ] At least two best-effort Agent CLIs can be picked on a ticket when their binary is installed, and open with the command pre-typed in their syntax
- [ ] Adding a best-effort CLI needs only a declarative entry, no new code path
- [ ] Status for a hookless CLI is shown with an "approximate" marking in the badge tooltip and Sessions view
- [ ] A hookless session still reaches "ended" reliably when the process exits
- [ ] With auto-submit off (default), nothing is submitted; with it on, the command is submitted
- [ ] The per-project auto-submit override wins over the global setting
- [ ] Contract tests cover a best-effort entry with a fake-CLI stub
