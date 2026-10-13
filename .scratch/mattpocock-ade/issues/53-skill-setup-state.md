# Skill setup state

Type: task
Status: ready-for-agent
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

- [ ] Core functions classify fixture skill directories as default, default with extras and modified
- [ ] For a modified setup, the deviations are listed (which skill differs, which core skill is missing, tracker not the ADE tracker)
- [ ] The deviation fingerprint is stable for the same setup and changes when the setup changes
- [ ] The state is recomputed when a skill or `docs/agents` file changes, without a restart
- [ ] A repo without setup shows the banner and gets `/setup-matt-pocock-skills` as its next step
- [ ] The app shows the current state and deviations for the project
- [ ] No code path writes to skill directories or `docs/agents`
