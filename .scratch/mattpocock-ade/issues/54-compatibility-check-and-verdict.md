# Compatibility check and verdict

Type: task
Status: ready-for-agent
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

- [ ] `dryland doctor --compat-prompt` prints the prompt, including the verdict format the agent must write
- [ ] A modified setup without a valid verdict or acceptance opens the dialog with the deviations listed
- [ ] Run check opens a session with the compatibility prompt command pre-typed
- [ ] A verdict file is parsed: broken features are disabled and show the reason, degraded features show a warning
- [ ] A rule marked broken produces no next steps; with an override stored, it does again
- [ ] A verdict for an older fingerprint is ignored and the dialog appears again
- [ ] Accept deviations suppresses the dialog until the fingerprint changes
- [ ] With Skip, no skill that is not installed is ever pre-typed
- [ ] A malformed verdict file is treated as no verdict, with a visible note
- [ ] Verdict handling is tested through core functions with fixture skill directories and verdict files
