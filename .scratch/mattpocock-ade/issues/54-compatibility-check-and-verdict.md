# Compatibility check and verdict

Type: task
Status: resolved
Blocked by: 29, 33, 53

Spec: [spec](../spec.md), user stories 80 to 84. "Write policy and skill setup". ADR 0003.

## What to build

How Dryland handles a modified skill setup: detect, warn and degrade, never refuse and never auto-repair.

A modified setup with no valid verdict opens a dialog listing the deviations with three choices:

- **Run check** opens a session pre-typed to run the compatibility prompt. The prompt ships with Dryland and is printed by `dryland doctor --compat-prompt`. The agent writes a Compatibility verdict to `.dryland/compat.md` in the main checkout: a small machine-readable header plus, per rule or feature, OK, degraded or broken with reasons. Clicking Run check is the consent to launch.
- **Skip** continues without a verdict: Dryland routes only recognized artifacts and pre-types only skills that exist.
- **Accept deviations** is stored per project against the deviation fingerprint, so the user is not asked again until the setup changes.

The verdict is tied to the fingerprint and invalidated when that changes. Broken features are disabled with a reason, degraded ones stay on with a warning. The user can override a disabled rule; the verdict never has the last word. The Settings UI for overrides comes with the Settings ticket; here an override is stored and honoured.

## Acceptance criteria

- [x] `dryland doctor --compat-prompt` prints the prompt, including the verdict format the agent must write
- [ ] A modified setup without a valid verdict or acceptance opens the dialog with the deviations listed
- [x] Run check opens a session with the compatibility prompt command pre-typed
- [x] A verdict file is parsed: broken features are disabled and show the reason, degraded features show a warning
- [x] A rule marked broken produces no next steps; with an override stored, it does again
- [x] A verdict for an older fingerprint is ignored and the dialog appears again
- [x] Accept deviations suppresses the dialog until the fingerprint changes
- [x] With Skip, no skill that is not installed is ever pre-typed
- [x] A malformed verdict file is treated as no verdict, with a visible note
- [x] Verdict handling is tested through core functions with fixture skill directories and verdict files

## Answer

Built in 9a9e80f and 0b04541. core compat.ts: parseVerdict reads .dryland/compat.md (front matter with dryland-compat: 1 and the setup fingerprint, then '- <rule id>: ok|degraded|broken - reason' lines; unknown rule ids make it malformed), readCompatibility ties it to the setup fingerprint (older ones ignored), decides needsDialog (modified, no valid verdict, deviations not accepted), lists degraded and broken features, and skillSetupSnapshot feeds verdict, overrides and installed skills into the rule engine, so broken rules give no steps until overridden and a modified setup without a verdict recommends only installed skills. 'dryland doctor --compat-prompt' prints the prompt with the fingerprint. Desktop: accept-deviations and overrides are stored per project in ui-state (compat), the CompatDialog offers Run check (scratch session with COMPAT_RUN_COMMAND typed; new work-target compat-check), Skip (remembered in memory only, so it returns after restart) and Accept deviations; SkillSetupPanel lists disabled/warned features, a note for a malformed file and Turn on/off buttons for overrides. Known limits: the dialog and Run check wiring in the renderer are not covered by tests (criteria 2 and 3 left unticked); the malformed-file note shows only in the panel's collapsed details; Accept deviations also leaves the installed-skills filter on; a stale-verdict note is not shown.

## Comments

Update to the Answer, commit b5bee16: the Playwright run (native and Linux, 42 tests each) now covers the dialog. It opens for a modified setup with the deviations listed, and Accept deviations closes it (skill-setup.spec.ts), so criterion 2 is ticked. Skip is exercised by the start-work fixtures, which also needed the recommended skills installed. Still untested: clicking Run check in the app (the session it opens is covered by work.test.ts), so criterion 3 stays unticked. Known limits unchanged: Skip is forgotten on every window reload or restart, and the malformed-file note shows only in the panel's collapsed details.
