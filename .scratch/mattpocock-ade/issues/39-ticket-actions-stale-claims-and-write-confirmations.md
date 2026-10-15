# Ticket actions, stale claims and write confirmations

Type: task
Status: resolved
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

- [x] Claim, resolve and unblock from a ticket's actions run immediately and appear in the live-events panel
- [x] A write from a general button shows a confirmation naming the exact `dryland` command
- [x] "Do not ask again" suppresses only that confirmation type and can be reset
- [x] Starting a session on a ticket claims it with that session as holder
- [x] A claim whose session is gone, or that was made outside Dryland, is shown as "claimed, possibly stale" with a release action
- [x] No stale claim is released without the user clicking release
- [x] A session in the waiting state is ranked first among the next steps, stale claims second
- [x] With auto-commit off, writes from the app change files without committing
- [x] No app action writes to tracker files other than through `dryland`

## Answer

Built in 5958e24 and 52a790b. Every app write runs the dryland CLI bundle (main/dryland-cli.ts, with the app's Electron as Node), so ticket.changed reaches the live-events panel. A ticket's own tab has Claim, Resolve (with an answer), Unblock from NN (ticket block --remove) and, on a possibly stale claim, Release; these run at once. A Tickets-view row with a possibly stale claim shows 'claimed by X, possibly stale' and a Release button; that counts as a general button (decided with the user), so it opens a confirmation naming the exact dryland command, with a 'Don't ask again' per confirmation type. The three types (tracker-metadata, user-config, prose-annotation; only the first is asked) are kept in ui-state for the Settings dialog (55). Until then the app's Tracker menu holds auto-commit (global checkbox, per-project radio: global/on/off) and Reset Write Confirmations. The app passes --commit or --no-commit on every write, so its setting wins over git's dryland.autoCommit; the CLI gained --commit. Starting work claims the ticket for the session (DRYLAND_SESSION_ID as holder), after the pre-typed command is chosen; a ticket someone else holds keeps its claim, and the session starts with a warning. Claiming a ticket you already hold now succeeds with no write, so an agent can re-claim its own ticket. The app feeds its sessions and their live states into readProjectState, so waiting sessions rank first and stale claims second, and the views refresh on every session-state change. A claim counts as held when a live session is its holder or works on its ticket. This also covers ticket 65's acceptance for the app. Tests: core rule and project-state tests, CLI claim tests (--commit, re-claim by the same holder), desktop tests for tracker-actions, ui-state, the dryland runner against the real bundle, and the work starter's claim; e2e for ticket actions, confirmation, do-not-ask and reset, and auto-commit off. Known limits: a claim made from a ticket tab is held by the branch, not a session, so it is flagged possibly stale at once; sessions live in memory, so every Dryland claim reads as possibly stale after an app restart (ADR 0008); a ticket claimed by another holder but worked on by a live session is not flagged.
