# Settings dialog: General, Tracker and Write confirmations

Type: task
Status: resolved
Blocked by: 39

Spec: [spec](../spec.md), user stories 61, 64, 85. "UI". Layout detail: `prototype/views-and-ux/` (Settings).

## What to build

The Settings modal with its six tabs: General, Agent CLIs, Tracker, Skills, Write confirmations, Updates. This ticket builds the modal and fills three tabs; the other three show a placeholder until their tickets land.

- **General**: live-events panel mode, legend reset, and the other app-wide UI preferences that already exist, including the session settings once their tickets have landed: the Stop session confirmation rule, "Resume sessions on start" and the session retention period (default 30 days).
- **Tracker**: auto-commit, and the polling interval for GitHub/GitLab if polling exists by then.
- **Write confirmations**: one row per confirmation type (tracker metadata write from a button, Dryland-owned user-config write, prose annotation) with its "do not ask again" state and a reset.

Settings are global with per-project overrides where they apply (auto-commit, confirmations). The dialog makes clear which level is being edited and when a project override is in effect.

## Acceptance criteria

- [x] The Settings modal opens from the menu and shows six tabs
- [x] Changing auto-commit globally affects the next tracker write; a per-project override wins for that project
- [x] The Write confirmations tab shows each type's current "do not ask again" state and resetting it brings the confirmation back
- [x] A setting that has a project override shows that it is overridden and offers to clear the override
- [x] Settings persist across restarts as local UI state
- [x] Tabs not yet filled say so instead of appearing broken

## Comments

From mattpocock-ade/75 (1e28cf0): the stop-session confirmation rule (UiState.stopConfirmation: always / busy-or-unseen / never, labels in shared/stop-session.ts) is set from a temporary Sessions menu in main/index.ts (sessionsMenu). Move it into the Settings dialog and drop that menu.

## Answer

Built the Settings modal (File > Settings..., Ctrl/Cmd+,) with six tabs in commit d83bc92. General holds the live-events panel mode, legend reset, Stop session confirmation rule and Resume sessions on start. Tracker holds global auto-commit and the open project's override, with an 'Overridden' status and Clear override. Write confirmations shows each type's state with a Reset. Agent CLIs, Skills and Updates say which ticket fills them. Changes go through one validated IPC (settings:change, shared/settings-change.ts, unit-tested). The Tracker menu and the settings in the Sessions menu are gone; Resume All Paused Sessions stays. Known limit: session retention period is not shown because no retention setting exists yet; polling interval likewise. Auto-commit of this ticket's own commit was not checked against Linux e2e (unit suite passes on Windows and Linux; desktop e2e run natively).
