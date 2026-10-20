# Settings: Agent CLIs and Skills tabs

Type: task
Status: resolved
Blocked by: 43, 44, 54, 55

Spec: [spec](../spec.md), user stories 43, 83, 85, 86. "UI". Layout detail: `prototype/views-and-ux/` (Settings).

## What to build

Fill the two remaining configuration tabs of the Settings modal.

- **Agent CLIs**: the list of Agent adapters with tier (first-class or best-effort) and whether the binary is installed; the default Agent CLI; auto-submit (global, with per-project override); and for each CLI that uses the user-level agent-config exception, the install state of Dryland's hook and trust entries with Install, Inspect and Remove. Every change to the user's agent config is visible and reversible from here, with the same effect as `dryland doctor`.
- **Skills**: the project's Skill setup state and deviations, the Compatibility verdict per rule or feature (OK, degraded, broken, with reasons), an override switch for each disabled rule, the accepted deviation fingerprint with a way to revoke it, and Run check.

## Acceptance criteria

- [x] The Agent CLIs tab lists every adapter with tier and installed state
- [x] Auto-submit can be set globally and overridden per project from this tab
- [x] Install and Remove of the Copilot hook and trust entries work from the tab and match what `dryland doctor` reports; Inspect shows exactly what Dryland wrote
- [x] The first install asks for the user-config write confirmation
- [x] The Skills tab shows state, deviations and the verdict per feature with reasons
- [x] Overriding a disabled rule re-enables it at once, and removing the override disables it again
- [x] Revoking an accepted fingerprint brings the deviations dialog back
- [x] Run check starts the same session as the dialog's Run check

## Answer

Built in 9484b14. Agent CLIs tab (AgentClisTab.tsx): every adapter with tier and installed state; auto-submit global and per-project override, moved here from General; for Copilot CLI the hook file and trust state with Install/Reinstall, Inspect (hook file text and trusted worktrees) and Remove, backed by core installAgentHooks/removeAgentHooks so the effect matches dryland doctor, with the first install asking the user-config confirmation. Skills tab (SkillsTab.tsx): setup state, deviations, per-feature verdict with reasons, override switch on broken rules, accepted-deviations state with Revoke (new Compatibility.accepted), and Run check starting the compat-check session. Core gained readAgentHooks and a nullable cwd. Tests: core doctor/compat, desktop agent-hooks and skill-setup, Playwright in skill-setup.spec.ts; pnpm test, test:linux, native and Linux e2e pass. Known limits: no default-Agent-CLI control (no such setting exists; not an acceptance criterion); Revoke brings the dialog back only while no valid verdict exists for the setup; Inspect and Remove cover the open project's worktrees only, like doctor; Reinstall and Remove do not ask for confirmation.
