# ADE write policy and non-default skill setups

Type: grilling
Status: resolved
Blocked by: 

## Question

Which edits may the ADE make to skill artifacts (mechanical metadata only vs. content), how are they presented to the user, and how does the ADE detect and handle a non-default skill setup (detect and warn, degrade, refuse)? Include the Settings surface this implies.

## Answer

Decided in a grilling session (Q1-Q13).

**Write policy**
- The ADE writes tracker metadata only through `ade` (claim, resolve, blocking, map index line, `Status:`/triage labels). Triage/label changes only on explicit user click, each a named `ade ticket` subcommand.
- Prose is not a hard no: the ADE may add **ADE-owned annotations** under strict rules: written only via `ade`, delimited (e.g. `<!-- ade: ... -->`), skills can ignore them; every ADE feature works when they are absent and the parser never fails on them; never edit or reorder skill-authored text; each addition type is recorded as a decision naming its UX/parsing benefit. v1 ships none beyond existing metadata lines; the mechanism is defined for later.
- Presentation: writes need a confirmation click, except actions started from a ticket (claim, resolve, unblock). Every write shows in the live-events panel and lands as an auto-committed pathspec commit (git log = audit, git revert = undo; no undo UI). Each confirmation type has its own "do not ask again" flag in global settings, resettable. Types: tracker metadata write from a button, ADE-owned user-config write, any future prose annotation. Launching a pre-typed command needs no confirmation of its own: clicking "Run check"/"Start" is the consent.

**Skill setup detection**
- On every startup and on file change the ADE compares installed skills and `docs/agents/*.md` to the default-mirror fingerprint (38 skills, `to-spec`/`to-tickets` renamed, tracker doc registering `ade`). States: default; default with extras (fine); modified (known skill differs, core skill missing, or tracker not `ade`).
- Modified + no valid verdict: dialog listing deviations with **Run check** (opens a new Agent CLI session with a pre-typed prompt to run `ade doctor --compat-prompt` and follow it), **Skip**, or **Accept deviations**. Accept is stored per project against the deviation fingerprint: silent until the fingerprint changes.
- **Compatibility check prompt** ships with the ADE (`ade doctor --compat-prompt`, also copy/launch from Settings). The agent diffs against the default, judges each deviation against the ADE's artifact formats and rule triggers, and writes a verdict file in the main checkout (e.g. `.ade/compat.md`, small machine-readable header, each ADE rule/feature OK/degraded/broken with reasons). Invalidated when the fingerprint changes.
- Degradation: broken = disabled with reason; degraded = on with warning; no verdict = conservative default (route only recognized artifacts, pre-type only existing skills, lens features keep working); user can override a disabled rule in Settings; verdict only toggles features. Nothing refused, no auto-repair.
- Unset repo (no skills / no ADE tracker): next-step engine recommends `setup-matt-pocock-skills` (pre-typed); `ade doctor` explains what is missing; the ADE does not write skills or `docs/agents` itself.

**Settings (global + per project)**: auto-commit of tracker writes; auto-submit of pre-typed commands (off); confirm-before-write toggle (on) and per-type "do not ask again"; ADE-owned user-config install/status/remove (via `ade doctor`); read-only skill-setup panel (state, diffs, verdict, accepted fingerprint, compat prompt launch). No per-skill customization.

**Out of v1**: updating Matt Pocock skills from the ADE (v1 only reports differences from the upstream mirror, no update seam).

Recorded in ADR 0003 (`docs/adr/0003-ade-write-policy-and-detect-degrade-skill-setup.md`).
