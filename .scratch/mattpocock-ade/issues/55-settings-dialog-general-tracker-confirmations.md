# Settings dialog: General, Tracker and Write confirmations

Type: task
Status: ready-for-agent
Blocked by: 39

Spec: [spec](../spec.md), user stories 61, 64, 85. "UI". Layout detail: `prototype/views-and-ux/` (Settings).

## What to build

The Settings modal with its six tabs: General, Agent CLIs, Tracker, Skills, Write confirmations, Updates. This ticket builds the modal and fills three tabs; the other three show a placeholder until their tickets land.

- **General**: live-events panel mode, legend reset, and the other app-wide UI preferences that already exist, including the session settings once their tickets have landed: the Stop session confirmation rule, "Resume sessions on start" and the session retention period (default 30 days).
- **Tracker**: auto-commit, and the polling interval for GitHub/GitLab if polling exists by then.
- **Write confirmations**: one row per confirmation type (tracker metadata write from a button, Dryland-owned user-config write, prose annotation) with its "do not ask again" state and a reset.

Settings are global with per-project overrides where they apply (auto-commit, confirmations). The dialog makes clear which level is being edited and when a project override is in effect.

## Acceptance criteria

- [ ] The Settings modal opens from the menu and shows six tabs
- [ ] Changing auto-commit globally affects the next tracker write; a per-project override wins for that project
- [ ] The Write confirmations tab shows each type's current "do not ask again" state and resetting it brings the confirmation back
- [ ] A setting that has a project override shows that it is overridden and offers to clear the override
- [ ] Settings persist across restarts as local UI state
- [ ] Tabs not yet filled say so instead of appearing broken
