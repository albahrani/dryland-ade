# Remaining screens: settings, dialogs, merge/PR flow, project switching

Type: prototype
Status: resolved
Blocked by: 13

## Question

Extend the views-and-ux prototype with the undesigned screens: Settings, new map/ticket dialogs, merge/PR flow in Source Control, project switching. Keep the prototype in .scratch/mattpocock-ade/prototype/.

## Answer

Verdict: good. Prototype extended in `.scratch/mattpocock-ade/prototype/views-and-ux/` (`screens.js` + hooks in `index.html`).

- **Settings** (modal, 6 tabs): General (default agent, auto-submit off), Agent CLIs (detected, hooks and Copilot trusted-folders install/remove, matching the Notes exception), Tracker (read-only source from `issue-tracker.md`, `gh`/`glab` check), Skills (fingerprint state, compat check, accept), Write confirmations (per-type don't-ask-again), Updates (latest/beta channel).
- **New map**: no form beyond the Agent CLI choice. Opens a temporary worktree and terminal with a bare `/wayfinder ` pre-typed; idea and effort name are typed in the agent CLI. The ADE never writes map files.
- **New ticket**: map, title, type, question, blocked-by; mechanical `ade ticket create` shown as a command preview, behind a write confirmation.
- **Merge / PR** (Source Control section, worktrees only): dry-run checks (clean tree blocks, conflicts block, unresolved ticket is a hint), local tracker offers merge (strategy, optional worktree/branch cleanup), GitHub/GitLab offer PR/MR via `gh`/`glab` with optional `/pr` pre-typed. Conflicts are handed to the agent (pre-typed prompt), never resolved by the ADE.
- **Project switching**: top-left dropdown plus an All Projects dialog listing tracker, live sessions and next-up; each project keeps its own tabs, switching leaves agents running. A repo without `issue-tracker.md` gets a banner to run `/setup-matt-pocock-skills`.


