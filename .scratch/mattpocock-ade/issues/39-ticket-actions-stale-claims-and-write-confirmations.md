# Ticket actions, stale claims and write confirmations

Type: task
Status: claimed
<!-- dryland: {"claim":{"holder":"main","at":"2026-10-15T14:48:52.694Z","was":"ready-for-agent"}} -->
Blocked by: 34, 35, 36

Spec: [spec](../spec.md), user stories 15, 30, 31, 61, 63 to 66. "Write policy and skill setup". ADR 0003.

## What to build

Tracker writes from the app, all going through `dryland`.

- **Direct actions.** Claim, resolve and unblock started from a ticket run without an extra confirmation.
- **Confirmed writes.** A write triggered from a general button asks for confirmation first. Each confirmation type has its own "do not ask again" flag that can be reset. The types are: tracker metadata write from a button, Dryland-owned user-config write, and any future prose annotation. Only the first is used here; the flags are stored as local UI state for the Settings dialog to show later.
- **Stale claims.** A claim that no live Dryland session holds is shown as "claimed, possibly stale" with an explicit release action. Nothing is ever released automatically.
- **Auto-commit setting.** The user can turn auto-commit off, globally or per project; the app passes it on to `dryland`.

Starting a session on a ticket claims it for that session. The live session states feed the rule engine snapshot, so waiting sessions and stale claims now rank first in the next steps.

## Acceptance criteria

- [ ] Claim, resolve and unblock from a ticket's actions run immediately and appear in the live-events panel
- [ ] A write from a general button shows a confirmation naming the exact `dryland` command
- [ ] "Do not ask again" suppresses only that confirmation type and can be reset
- [ ] Starting a session on a ticket claims it with that session as holder
- [ ] A claim whose session is gone, or that was made outside Dryland, is shown as "claimed, possibly stale" with a release action
- [ ] No stale claim is released without the user clicking release
- [ ] A session in the waiting state is ranked first among the next steps, stale claims second
- [ ] With auto-commit off, writes from the app change files without committing
- [ ] No app action writes to tracker files other than through `dryland`
