# Skill setup state

Type: task
Status: resolved
Blocked by: 30

Spec: [spec](../spec.md), user stories 6, 7, 79. "Write policy and skill setup". ADR 0003.

## What to build

Dryland detects the Skill setup state of a project on every startup and on file change, by fingerprinting the installed skills and `docs/agents/*.md` against the default mirror that ships with Dryland. States:

- **default**
- **default with extras**: additional skills, nothing known changed
- **modified**: a known skill differs, a core skill is missing, or the tracker is not the ADE tracker

The state and the list of deviations are shown in the app. A repo without the skills set up gets a banner and a next step recommending `/setup-matt-pocock-skills`. Dryland never writes skills or `docs/agents` files itself. It only reports differences from the upstream mirror; updating skills is out of scope.

The dialog for modified setups and the compatibility verdict come with the next ticket.

## Acceptance criteria

- [x] Core functions classify fixture skill directories as default, default with extras and modified
- [x] For a modified setup, the deviations are listed (which skill differs, which core skill is missing, tracker not the ADE tracker)
- [x] The deviation fingerprint is stable for the same setup and changes when the setup changes
- [x] The state is recomputed when a skill or `docs/agents` file changes, without a restart
- [x] A repo without setup shows the banner and gets `/setup-matt-pocock-skills` as its next step
- [x] The app shows the current state and deviations for the project
- [x] No code path writes to skill directories or `docs/agents`

## Answer

Built in c09bb4c and 65ad657. core: skill-setup.ts fingerprints each installed skill (its Markdown files, line endings ignored) against a shipped mirror (skill-mirror.ts, generated from the 38 upstream skills by scripts/build-skill-mirror.mjs) and classifies the repo as not-set-up, default, default-with-extras or modified, listing deviations (skill differs, core skill missing, no skills, tracker doc missing or unreadable) plus a stable fingerprint over skills and docs/agents. readProjectState carries it, and tolerates a missing tracker doc so /setup-matt-pocock-skills is the next step. watch-project also watches .claude/.agents skill dirs, so the state recomputes without a restart. The sidebar shows SkillSetupPanel: a banner for not-set-up, else the state with deviations collapsed. Nothing writes skills or docs/agents. Decisions and limits: not-set-up means no skills OR no tracker doc; the ADE tracker is any tracker Dryland reads; docs/agents files feed the fingerprint but are not compared individually; only *.md files of a skill are hashed; only .claude/skills and .agents/skills in the main checkout are scanned; the core-skill list is a guess (code-review, implement, implement-spec, pr, setup-matt-pocock-skills, to-spec, to-tickets, triage, wayfinder); accept-deviation storage and the dialog are ticket 54.
