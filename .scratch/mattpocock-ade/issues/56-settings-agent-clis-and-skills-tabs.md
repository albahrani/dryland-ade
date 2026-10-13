# Settings: Agent CLIs and Skills tabs

Type: task
Status: ready-for-agent
Blocked by: 43, 44, 54, 55

Spec: [spec](../spec.md), user stories 43, 83, 85, 86. "UI". Layout detail: `prototype/views-and-ux/` (Settings).

## What to build

Fill the two remaining configuration tabs of the Settings modal.

- **Agent CLIs**: the list of Agent adapters with tier (first-class or best-effort) and whether the binary is installed; the default Agent CLI; auto-submit (global, with per-project override); and for each CLI that uses the user-level agent-config exception, the install state of Dryland's hook and trust entries with Install, Inspect and Remove. Every change to the user's agent config is visible and reversible from here, with the same effect as `dryland doctor`.
- **Skills**: the project's Skill setup state and deviations, the Compatibility verdict per rule or feature (OK, degraded, broken, with reasons), an override switch for each disabled rule, the accepted deviation fingerprint with a way to revoke it, and Run check.

## Acceptance criteria

- [ ] The Agent CLIs tab lists every adapter with tier and installed state
- [ ] Auto-submit can be set globally and overridden per project from this tab
- [ ] Install and Remove of the Copilot hook and trust entries work from the tab and match what `dryland doctor` reports; Inspect shows exactly what Dryland wrote
- [ ] The first install asks for the user-config write confirmation
- [ ] The Skills tab shows state, deviations and the verdict per feature with reasons
- [ ] Overriding a disabled rule re-enables it at once, and removing the override disables it again
- [ ] Revoking an accepted fingerprint brings the deviations dialog back
- [ ] Run check starts the same session as the dialog's Run check
