# Spec: Dryland ADE v1

Status: ready-for-agent

Source: [map](map.md) and its resolved tickets (`issues/01` to `issues/19`), ADRs 0001 to 0008, root `GLOSSARY.md`.

Naming: the working title "ADE" became **Dryland ADE** (short: Dryland). This spec says `dryland` wherever earlier tickets and ADRs say `ade` (the CLI binary, `ade doctor`, the launcher). Derived prefixes follow the binary name: environment variables are `DRYLAND_*`, the annotation marker is `<!-- dryland: ... -->`, the repo-level directory is `.dryland/`. "ADE" stays the category word.

## Problem Statement

I work in repos that use the Matt Pocock skills. The skill workflow leaves its state spread across maps, tickets, specs, the glossary, ADRs and git: which tickets are open, which are blocked, which map still has fog, which branch belongs to which ticket. To find out what to do next I have to read those files by hand, remember which skill comes after which, and type the right skill command into the right Agent CLI in the right directory.

It gets worse when I run several sessions at once. Sessions in different worktrees edit the same local-markdown ticket files, so claims race and resolutions get lost or conflict. I cannot see at a glance which session is working, which is waiting for my answer, and which has finished. Branches and worktrees pile up with no visible link to the ticket they were made for.

I want to keep using my own Agent CLI subscriptions (Claude Code, GitHub Copilot CLI). I do not want a tool that needs an API key, bills per token, or replaces the CLIs I already know.

## Solution

Dryland ADE is a cross-platform desktop ADE for repos using the Matt Pocock skills. It is a lens over the repo's skill artifacts and git state, plus an actuator that launches Agent CLI sessions. The repo stays the source of truth; Dryland keeps only minimal local UI state and rebuilds everything else from files, git and the tracker on start.

It shows every map and ticket of a project, grouped by map and kind, with status, blocking and claims. A deterministic rule engine marks the next step and explains why. One click creates a linked worktree for a ticket and opens the chosen Agent CLI in an embedded terminal with the recommended skill command already typed, not submitted. Sessions report running, waiting, idle and ended through each CLI's own hooks, so I can see which one needs me. Git (branch, changes, diffs, commit graph, merge or PR) is shown in the context of the selected ticket's worktree.

A standalone `dryland` CLI is the single write path for tickets and the map index. It fronts local-markdown, GitHub and GitLab, keeps local-markdown state in the main checkout, and writes atomically under a lock, so many sessions can work in parallel without corrupting tracker state. The skills are told to use it through the "Other" tracker option of `setup-matt-pocock-skills`.

Dryland is unofficial and community-made, MIT licensed, single user and local only.

## User Stories

### Projects and setup

1. As a developer, I want to open a local git repo as a project, so that Dryland can read its skill artifacts.
2. As a developer, I want to have several projects open and switch between them from a project widget, so that I can work across repos.
3. As a developer, I want an All Projects dialog listing each project's tracker, live session count and next-up item, so that I can decide where to go next.
4. As a developer, I want each project to keep its own open tabs, so that switching does not lose my place.
5. As a developer, I want sessions in other projects to keep running when I switch, so that switching never interrupts an agent.
6. As a developer opening a repo without the skills set up, I want a banner and a next step recommending `/setup-matt-pocock-skills`, so that I know how to get started.
7. As a developer, I want Dryland never to write skills or `docs/agents` files itself, so that setup stays owned by the skills.
8. As a developer, I want Dryland to read which tracker the repo uses from `docs/agents/issue-tracker.md`, so that I do not configure it twice.
9. As a developer, I want a tracker widget with tracker-specific actions (reveal the issues folder for local-markdown, open issues in the browser for GitHub/GitLab), so that I can reach the raw tracker quickly.
10. As a developer using a plain native tracker (not the ADE tracker), I want Dryland to still work in lens mode (read and launch, best-effort claims), so that I can try it before changing my setup.

### Tickets and maps

11. As a developer, I want a Tickets view grouped by map, so that I see work in the context of its effort.
12. As a developer, I want tickets under each map grouped by kind (Fog, Planning, Implementation), so that I see where an effort stands in the skill workflow.
13. As a developer, I want ticket status (ready, in progress, blocked, done) shown as an icon, so that the tree stays compact.
14. As a developer, I want done tickets folded into one "N done" line, so that finished work does not crowd the tree.
15. As a developer, I want to see who or what holds a claim on a ticket, so that I do not start work someone else has.
16. As a developer, I want to see what blocks a ticket, so that I know what to clear first.
17. As a developer, I want blocking shown as "unknown" when the backend cannot say (for example GitLab without Premium and no body line), so that Dryland never guesses.
18. As a developer, I want a Maps view with one row per map and a stacked progress bar, so that I can compare efforts at a glance.
19. As a developer, I want selecting a map to show a stats card and a "Continue map" action, so that I can resume wayfinding in one click.
20. As a developer, I want to open a ticket or map in a tab with a collapsible details header, so that I can read it next to its terminal.
21. As a developer, I want to create a ticket from a dialog (map, title, type, question, blocked-by) that previews the exact `dryland ticket create` command, so that I see what will be written.
22. As a developer, I want to start a new map by choosing only an Agent CLI and getting `/wayfinder ` pre-typed in a temporary worktree, so that the skill, not Dryland, authors the map.
23. As a developer, I want the tickets tree to refresh when any session changes a ticket through `dryland`, so that I always see current state.
24. As a developer on GitHub or GitLab, I want tickets refreshed on window focus and on a timer, so that remote changes appear without webhooks.
25. As a developer, I want local-markdown ticket files to keep their default skill format, so that they stay hand-readable and skill-compatible.

### Next step

26. As a developer, I want the next-up items marked with a gold bar and a star, so that I see what to do without reading everything.
27. As a developer, I want a one-sentence "why this next" on hover, so that I trust the recommendation.
28. As a developer, I want the full explanation (rule, reason, evidence read from which artifact and field), so that I can check it against the files.
29. As a developer, I want to ask "why not X?" and get X's unresolved blockers, so that I understand why something is not recommended.
30. As a developer, I want sessions waiting for my input ranked first, so that agents are not left stalled.
31. As a developer, I want possibly stale claims flagged ahead of new work, so that stuck tickets get noticed.
32. As a developer, I want frontier tickets recommended lowest number first with `/wayfinder` naming the ticket, so that maps progress in order.
33. As a developer, I want a cleared map (no open child tickets, no fog) to recommend `/to-spec`, so that the workflow moves on.
34. As a developer, I want a spec without tickets to recommend `/to-tickets`, so that I slice it.
35. As a developer, I want ready tickets to recommend `/implement` or `/implement-spec`, so that implementation starts with the right skill.
36. As a developer, I want a `needs-triage` item to recommend `/triage`, so that untriaged work surfaces.
37. As a developer, I want a finished ticket with a branch ahead to recommend `/pr`, and a merged feature to recommend `/retro`, so that housekeeping is not forgotten.
38. As a developer, I want recommendations to be the same for the same repo state, so that I can rely on them.
39. As a developer, I want to ignore a recommendation and launch any installed skill myself, so that Dryland never blocks me.
40. As a developer, I want the star on the map itself when only fog remains, so that I know the next step is on the map, not a ticket.

### Starting work and sessions

41. As a developer, I want to pick an Agent CLI on a ticket and have Dryland create its worktree and open the CLI there, so that starting work is one action.
42. As a developer, I want the recommended skill command typed into the terminal but not submitted, so that I can edit it before running.
43. As a developer, I want auto-submit as an opt-in setting, so that I can speed things up once I trust it.
44. As a developer, I want a real embedded terminal for each session, so that I interact with the CLI exactly as in my own terminal.
45. As a developer, I want sessions to run under my own CLI login, so that I use my subscription and no API key.
46. As a developer, I want each session's state (launched, running, waiting, idle, ended) shown as a badge on the agent icon, so that I see who needs me.
47. As a developer, I want a Sessions view grouped by map (or by agent, or ungrouped) with an Unlinked group, so that I can find any session.
48. As a developer, I want a session I start by hand inside a Dryland-created worktree to link to its ticket, so that manual sessions are not lost.
49. As a developer, I want ticketless sessions to get a scratch worktree, so that exploratory work is isolated too.
50. As a developer, I want ended sessions kept as read-only transcripts in their tab, so that I can read what happened.
51. As a developer, I want status for CLIs without hooks marked approximate, so that I know how much to trust it.
52. As a developer, I want best-effort Agent CLIs (launch and pre-typed command only) besides Claude Code and Copilot CLI, so that I can use other agents.
53. As a developer, I want a live-events panel (expanded, one line, or hidden) showing session events and every Dryland write, so that I can follow what is happening.
54. As a developer, I want a status bar with the selected session's state, its branch, and live/total session counts, so that context is always visible.
55. As a developer, I want a confirmation listing live sessions when I quit, hidden ones included and those with an unseen question or unread output first, so that I do not kill agents by accident.
56. As a developer, I want quitting to keep my claims and my sessions resumable, so that I can pick up a grilling or an implementation where I left it.
57. As a Copilot CLI user, I want Dryland-created worktrees trusted automatically, so that no trust prompt interrupts the launch.

### Parallel work and tracker writes

58. As a developer running many sessions, I want exactly one session to win a claim on a ticket, so that two agents never work on the same ticket.
59. As a developer, I want local-markdown tracker state to live in the main checkout only, so that every session and the UI see the same thing.
60. As a developer, I want every tracker write committed on its own with a descriptive message, so that `git log` is the audit trail and `git revert` the undo.
61. As a developer, I want to turn auto-commit off, so that I can manage commits myself.
62. As a developer, I want a warning when the main checkout is not on the default branch, so that tracker state does not land on the wrong branch.
63. As a developer, I want claims that no live or paused session holds, and whose branch is no checked-out ticket worktree, shown as "claimed, possibly stale" with an explicit release action, so that nothing is released behind my back.
64. As a developer, I want writes I trigger from a general button to ask for confirmation, with a per-type "do not ask again", so that I stay in control without being nagged.
65. As a developer, I want actions I start from a ticket (claim, resolve, unblock) to run without an extra confirmation, so that direct actions stay quick.
66. As a developer, I want Dryland never to edit skill-authored prose, so that my glossary, ADRs and specs are only changed by me and the skills.
67. As an agent in a session, I want a `dryland` command on `PATH` with short plain-text output and errors that state the next action, so that I can manage tickets without editing files.
68. As an agent, I want `dryland` to work when the desktop app is closed, so that sessions in outside terminals still work.
69. As an agent, I want to be told to stop and tell the user when `dryland` is missing, so that I do not fall back to editing tracker files.
70. As a developer on GitHub or GitLab, I want Dryland to use my `gh`/`glab` login and never ask for or store a token, so that credentials stay where they are.

### Git in context

71. As a developer, I want Source Control (branch, staged and changed files, commit box, commit graph) scoped to the selected ticket's or session's worktree, so that git is always shown in context.
72. As a developer, I want an Explorer for the selected worktree with file and diff tabs, so that I can review what the agent did.
73. As a developer, I want branches not created by Dryland shown as unlinked, with a commit trailer as fallback link, so that nothing is silently mismatched.
74. As a developer, I want a Merge/PR section with dry-run checks (dirty tree and conflicts block, unresolved ticket is a hint), so that I do not merge something broken.
75. As a developer on local-markdown, I want a local merge with a chosen strategy and optional worktree/branch cleanup, so that I can finish a ticket inside Dryland.
76. As a developer on GitHub or GitLab, I want to open a PR/MR via `gh`/`glab`, optionally with `/pr` pre-typed, so that I follow the skill workflow.
77. As a developer, I want merge conflicts handed to the agent as a pre-typed prompt, so that Dryland never resolves conflicts itself.
78. As a developer, I want to prune a worktree and branch only when the ticket is resolved, the branch is merged or empty, the tree is clean and no session is attached, so that pruning cannot lose work.

### Skill setup, settings and health

79. As a developer, I want Dryland to detect whether my skill setup is default, default with extras, or modified, so that I know whether its assumptions hold.
80. As a developer with a modified setup, I want a dialog listing the deviations with Run check, Skip and Accept deviations, so that I choose how to proceed.
81. As a developer, I want Run check to open a session pre-typed to run the compatibility prompt, so that an agent judges my deviations.
82. As a developer, I want a compatibility verdict to disable broken features with a reason and warn on degraded ones, so that Dryland degrades instead of misleading me.
83. As a developer, I want to override a disabled rule in Settings, so that the verdict never has the last word.
84. As a developer, I want accepted deviations remembered until the setup changes again, so that I am not asked repeatedly.
85. As a developer, I want a Settings dialog (General, Agent CLIs, Tracker, Skills, Write confirmations, Updates), so that all configuration is in one place.
86. As a developer, I want to install, inspect and remove Dryland's user-level hook and trust entries from Settings or `dryland doctor`, so that every change to my agent config is visible and reversible.
87. As a developer, I want Dryland's hooks to be inert in terminals it did not spawn, so that my normal CLI use is unaffected.
88. As a developer, I want `dryland doctor` to check setup, tracker, hooks and `PATH` and say what is missing, so that I can fix problems myself.

### Install and update

89. As a Windows, macOS or Linux user, I want an installer from GitHub Releases, so that I can install without building.
90. As a user, I want documented workarounds for unsigned builds, so that I can get past SmartScreen and Gatekeeper.
91. As a user, I want to choose the `latest` or `beta` update channel, so that I control how early I get changes.
92. As a user, I want updates downloaded in the background and applied on next quit, so that updating does not interrupt sessions.
93. As a macOS or deb user, I want an "update available" notice with a link, so that I know to update even without auto-update.
94. As a user, I want an opt-in to put `dryland` on my global `PATH`, so that I can use it in my own terminals.
95. As a user, I want it clear in the app and README that Dryland is unofficial and community-made, with credit to Matt Pocock's skills, so that affiliation is never implied.

### Paused sessions and resuming (ADR 0010)

96. As a developer, I want closing a session tab to only hide it, so that the agent keeps working while I look at something else.
97. As a developer, I want to stop a session explicitly, and to be asked first when it is running or holds a question or output I have not seen, so that I never cut off an agent or lose an unread question by accident.
98. As a developer, I want a ticket or map whose session is not running to offer Resume, so that I continue the same Agent CLI session instead of starting over.
99. As a developer, I want a paused session to say whether it was waiting on me or interrupted, so that I know what it needs before I resume it.
100. As a developer, I want the session tabs I had open to come back on start, resuming when I open them, with a "Resume all" action and an opt-in setting to resume on start, so that I get back to where I was without every agent starting at once.
101. As a developer who also works outside Dryland, I want sessions that ran `dryland ticket` commands, and sessions found in a ticket's worktree, linked to that ticket, so that resuming works for work I did in my own terminals too.
102. As a developer, I want paused sessions kept for a number of days I can set, so that old work drops out of the views.
103. As a developer with many sessions, I want hidden sessions shown compactly in the Sessions view, with waiting ones on top, so that the view stays usable.

## Implementation Decisions

### Product shape and constraints

- A fresh build, not a fork of Orca. Small isolated Orca pieces (Agent CLI config-table idea, worktree slugify and collision suffixing, ConPTY handling) may be copied with MIT attribution in `THIRD_PARTY_NOTICES`.
- Agent CLIs are driven only through their own binaries under the user's subscription login, in a PTY. No Claude API, no Claude Agent SDK, no headless structured (`stream-json`) mode in v1.
- Single user, local only, multiple projects. Platform agnostic, verified Windows-first.
- The repo is the source of truth. Dryland stores only small local UI state (open tabs, settings, accepted fingerprints). Session events are never stored; state is rebuilt from files, git and the tracker on start.
- v1 targets the default setup produced by `setup-matt-pocock-skills` with the ADE tracker registered as the "Other" tracker.

### Modules

Three packages in a pnpm workspace under the `@dryland` scope:

- **core**: pure TypeScript, no Electron imports. Contains artifact parsing (maps, tickets, specs, triage labels, tracker doc), the normalized ticket model, the tracker backends (local-markdown, GitHub, GitLab), the next-step rule engine, the Agent adapter definitions and status-event mapping, the skill setup fingerprinting, and worktree naming. External processes (`git`, `gh`, `glab`) are reached through one process-runner interface.
- **cli**: the `dryland` command, a thin shell over core. Bundled to one JS file and run by the Electron binary in node mode; needs no system Node and works with the app closed.
- **desktop**: the Electron app (React renderer, `electron-vite`). The main process owns PTYs behind a PTY-provider interface, the live-reporting listener, file watching and tracker polling. No daemon; no process outlives the UI.

### Tracker write path (ADR 0001)

- `dryland` is the only write path for tickets and the map index. The generated `issue-tracker.md` tells agents never to edit tracker files directly and to stop and tell the user if `dryland` is missing.
- Local-markdown tracker state lives only in the main checkout, located from any worktree via git's common dir. Writes are atomic and made under a lock; ticket numbers are allocated under that lock.
- Claims record the holder (branch or session id) and a timestamp.
- Every mutating command commits only its own tracker paths with a descriptive message. On by default, opt-out. If the commit fails the change stays on disk and the CLI warns.
- GitHub/GitLab: claim is the assignee, blocking uses native dependencies where available, the map index is the map issue's body. GitLab without Premium keeps blocking in a `Blocked by:` body line. No webhooks; poll on focus and on a timer. Missing or unauthenticated `gh`/`glab` is reported clearly; tokens are never requested or stored.
- Prose files (`GLOSSARY.md`, ADRs, specs) are ordinary git files edited per worktree and merged by git. Dryland surfaces conflicts and does no locking.

### CLI surface

- Command groups: `ticket` (create, list, show, claim, release, resolve, block, comment), `map` (show, frontier, index), `worktree` (create, list, prune), `status` (report a session event; called by hooks), `doctor` (setup, tracker, hooks, `PATH`, user-config install/status/remove, `--compat-prompt`).
- Triage and label changes are named `ticket` subcommands.
- Default output is short plain text written for agents. Every command supports `--json` for the app and hooks. Failures exit non-zero and state the next action.
- `ticket resolve` writes straight to the main checkout and never deletes a worktree. `worktree prune` removes worktree and branch only if the ticket is resolved, the branch is merged or empty, the worktree is clean and no session is attached; it needs confirmation in the app and `--yes` in the CLI.

### Normalized ticket model

- Fields: id, title, type (research, prototype, grilling, task, or none), state (open, claimed, resolved), claimant, blockers (a known list, or unknown), parent map, triage role, body, answer, comments, plus an opaque `raw` field for backend extras that the rules never read.
- The local-markdown format is unchanged from the default skills (`Type:`, `Status:`, `Blocked by:`, `## Answer`, `## Comments`). `dryland` adds no fields.
- Triage role strings come from `docs/agents/triage-labels.md`.
- Ticket kind is derived, not stored: Fog (the map's not-yet-specified items), Planning (grilling, research, prototype), Implementation (task).

### Worktrees and linking

- One worktree per ticket, for planning and implementation alike, named `<effort>/<NN>-<slug>`. Ticketless sessions use `<effort>/scratch-<slug>`. Slugs are collision-suffixed.
- A Linked worktree is tied to its ticket by that name, with a commit trailer as fallback. Branches matching neither are unlinked.
- Dryland records session, worktree and ticket at spawn. A session started by hand inside a Dryland-created worktree links by its working directory.
- A claim's holder is always a branch: Dryland claims for the ticket's worktree branch, never for its own session id.

### Sessions, pausing and resuming (ADR 0010)

- A session is the Agent CLI's own session: it outlives its process and is resumable. It is live while its process runs in Dryland. A paused session is a known, resumable session of a claimed item with no live process.
- The session index lives at `<git common dir>/dryland/sessions.json`, shared by all worktrees and never committed. Per item (ticket, map or scratch worktree) it lists known sessions, newest first, with CLI, the CLI's session id, last seen and, for sessions the app ran, last state.
- The app writes the index from its sessions' hooks, including the new session id after `/clear`. Every mutating `dryland ticket` command run inside an Agent CLI session records that session against the ticket, with or without the app. `dryland status` stays a no-op without the app.
- Startup and window focus reconcile the index with the tracker, git and each CLI's own history for the item's worktree (Claude Code only; Copilot's history is not per directory). Sessions found there are added without a last state.
- Claim states: live (a session runs in Dryland), paused (the index knows a resumable session), possibly stale (neither, and its branch is no checked-out ticket worktree). A default-branch claim with no known session is possibly stale.
- Paused labels from the last state: "was waiting on you", "interrupted", or "Paused".
- Sessions are launched with the CLI's `--session-id`. Resume uses the CLI's resume-by-id once the CLI's history still has that session (Copilot starts a blank session under an unknown id), falling back to the CLI's session picker in the item's directory, then to a fresh start with the pre-typed command.
- Closing a session tab hides it: the PTY keeps running, its output is buffered in the main process (bounded) and replayed when the tab is reopened from the ticket, map, Sessions view or a next-up marker. "Stop session" is its own action and asks first when the session is running, or waiting or idle with output not seen since; the rule is a setting.
- Startup restores the session tabs open at quit and resumes each when it is first shown. "Resume all" resumes every paused session as hidden sessions; "Resume sessions on start" does it automatically and is off by default.
- A paused session drops out of views when its ticket is resolved or its claim released. Index entries are removed after a retention period, a setting with default 30 days.
- Sessions view layout (ticket 71): three split panes, Hidden, Paused, Open, in that order. Their headers never scroll away; each pane scrolls on its own, collapses to its header and is resized by dragging the sash between panes. Header badges show the waiting count (gold, "were waiting" for Paused) before the total. Hidden and Paused hold a tree by map (Unlinked last); the view's "..." menu switches both trees to group by agent or to a flat list, remembered per project; there is no grouping by state, since the panes and the waiting-first order already sort by state; map groups start collapsed, groups with waiting sessions sort first, waiting or was-waiting sessions stay visible under a collapsed group, and a group shows `(waiting/total)`, or just the total, with the full status breakdown in its tooltip. Rows are one line: agent icon with state badge, item title, and the state, or a paused pill ("was waiting", "interrupted", "paused") with its age; Stop on hover for live rows, Resume for paused ones, a dot for unseen output. Paused carries Resume all. Open lists the open session tabs in two-line rows (title, then the question or last output), waiting first.
- A ticket with a paused session shows a pause badge on its agent icon (gold if it was waiting, red if interrupted), a pill with the label in its header, and in place of the terminal a box with the session's last output line when Dryland still holds it (it paused during this run; Dryland keeps no transcript across restarts), how to continue, the resume command, and Resume, Pick another session and Start fresh. A map row shows `●waiting` and paused counts; the map tab header lists open, hidden and paused counts, the paused items, and "Resume all on this map". The status bar shows open, hidden (waiting) and paused counts; the Sessions activity badge counts live waiting sessions.

### Agent adapters

- An Agent adapter is a declarative entry: binary, launch arguments, skill-command syntax, initial-prompt handling, hook-injection method, status-event mapping. Small code hooks exist only where a first-class CLI needs them.
- Tiers: Claude Code and GitHub Copilot CLI are first-class. All others are best-effort: launch plus pre-typed command, no status guarantee; status from PTY heuristics is marked approximate.
- Launch: spawn the interactive CLI in a PTY in the ticket's worktree and type the recommended skill command without Enter. No `-p` or initial-prompt-argument launch, because those submit immediately. Auto-submit is an opt-in setting.
- Spawned PTYs get the install directory's launcher on `PATH` and the environment variables `DRYLAND_PORT`, `DRYLAND_TOKEN`, `DRYLAND_SESSION_ID` and `DRYLAND_PANE_KEY`.
- Hook injection prefers per-launch or worktree-local means: Claude Code gets its hooks through the per-launch settings flag, with no user-config write.
- **User-level agent-config exception**: where that is what makes hooks and first-launch trust reliable, Dryland may make narrow, Dryland-owned, reversible writes to user-level agent config. For Copilot CLI this is a dedicated hook file in the user's Copilot hooks directory, gated on `DRYLAND_PANE_KEY` so it is inert outside Dryland PTYs, and appending Dryland worktrees to `trustedFolders`. Rules: never rewrite unrelated keys, skip unparseable files, honour Copilot's config lock file and tolerate Copilot rewriting the file, and provide install/status/remove through `dryland doctor` and Settings. The first such write is a confirmed write type.
- Status mapping (Copilot column verified interactively on Windows; Claude column from documentation only):

  | Session state | Claude Code | Copilot CLI |
  | --- | --- | --- |
  | launched | Dryland's own PTY spawn | Dryland's own PTY spawn |
  | running | `UserPromptSubmit`, `PreToolUse`, `PostToolUse` | `userPromptSubmitted`, `preToolUse`, `postToolUse` |
  | waiting | `Notification` (permission prompt, needs input), `PermissionRequest` | `permissionRequest`, `notification` (permission prompt) |
  | idle | `Stop`, `Notification` (idle prompt) | `agentStop` |
  | ended | `SessionEnd` | `sessionEnd` |

  Copilot's `sessionStart` fires only at the first submitted prompt, so "launched" always comes from the PTY spawn and the CLI's own session id is learned at first submit. Copilot's idle notification is not relied on.

### Live reporting

- The app listens on `127.0.0.1` on a random port. Port and a random per-launch token are written to a lock file in a per-user app directory.
- `dryland status` POSTs an authenticated event and exits 0 silently when there is no lock file or the connection fails. Reporting is fire-and-forget.
- Event shape: `{session_id, kind, timestamp, payload?}`. Kinds: `session.started`, `session.running`, `session.waiting`, `session.idle`, `session.ended`, and `ticket.changed`, which every mutating `ticket` and `map` command emits.
- Events drive the session list, ticket refresh and the live-events panel. They are not persisted; only a session's last state is kept in the session index (ADR 0010).

### Next-step rule engine

- A pure function from a repo snapshot to a ranked list of next steps. Each step carries a target artifact, a recommended skill command, a rule id, a one-sentence reason and an evidence list (artifact and field read).
- Snapshot: normalized tickets and maps, presence of spec/ADR/glossary files, coarse git state per Linked worktree (exists, ahead of default branch, merged; PR exists for GitHub/GitLab, optional), live session state, skill setup state and compatibility verdict.
- Ordered rules in code. No LLM. No user-editable rules in v1.
- Routing:
  - no setup config: `/setup-matt-pocock-skills`
  - `needs-triage` item: `/triage`
  - map with a frontier ticket: `/wayfinder <map>` naming the ticket
  - cleared map (no open child tickets, no fog): `/to-spec <map>`
  - spec without tickets: `/to-tickets`
  - spec with ready tickets: `/implement-spec`, or `/implement` per `ready-for-agent` ticket
  - branch ahead and ticket done: `/pr` (with `/code-review` before)
  - merged feature: `/retro`
- Priority: a missing setup config first (nothing else works without it), then waiting sessions, then paused sessions that were waiting, then possibly stale claims, then map frontier (lowest number first), then ready implementation work, then untriaged or unspecified work, then housekeeping (`/pr`, `/retro`).
- A claim with no live or paused session behind it, and whose branch is no checked-out ticket worktree, is flagged "claimed, possibly stale". It is never auto-released.
- Unknown backend facts are flagged ("blocking unknown"), never guessed.
- "Why not X?" lists X's unresolved blockers.
- Skills without a mechanical trigger are never recommended by rules but stay launchable by the user.

### Write policy and skill setup (ADR 0003)

- Dryland writes tracker metadata only, and only through `dryland`. Writes need a confirmation click unless started from a ticket (claim, resolve, unblock). Each confirmation type has its own resettable "do not ask again" flag: tracker metadata write from a button, Dryland-owned user-config write, any future prose annotation.
- Clicking "Start" or "Run check" is the consent to launch that pre-typed command.
- ADE-owned annotations in prose are defined as a mechanism (written via `dryland`, delimited as `<!-- dryland: ... -->`, optional for every feature, never altering skill-authored text) but v1 ships none. The parsers must tolerate them.
- Skill setup state is computed on every startup and on file change by fingerprinting installed skills and `docs/agents/*.md` against the default mirror. States: default, default with extras, modified (a known skill differs, a core skill is missing, or the tracker is not the ADE tracker).
- Modified with no valid verdict opens a dialog: Run check, Skip, Accept deviations. Accept is stored per project against the deviation fingerprint.
- The compatibility prompt ships with Dryland (`dryland doctor --compat-prompt`). The agent writes a Compatibility verdict to `.dryland/compat.md` in the main checkout: a small machine-readable header plus, per rule or feature, OK, degraded or broken with reasons. It is tied to the fingerprint and invalidated when that changes.
- Broken features are disabled with a reason, degraded ones stay on with a warning, and with no verdict Dryland routes only recognized artifacts and pre-types only skills that exist. The user can override a disabled rule. Nothing is refused and nothing is auto-repaired.

### UI

- VS Code-style shell: menu bar with a project widget, tracker widget, left activity bar (Tickets, Maps, Sessions), editor tabs in the middle (ticket, map, session, file, diff), right Explorer and Source Control, collapsible live-events panel, status bar. No global branch selector; a branch belongs to a worktree.
- Selecting a ticket, map or session drives all panes.
- Indicators are agent icons with a state badge (working arc, waiting bubble, idle dash, ended square) and ticket status icons, all with text tooltips and an initially shown, dismissible legend.
- Every view has inline actions and a "..." menu (expand/collapse, sort, filters, grouping, show done/fog, tab management).
- Settings is a modal with six tabs: General, Agent CLIs, Tracker, Skills, Write confirmations, Updates. Settings are global with per-project overrides where they apply (auto-commit, auto-submit, confirmations, accepted fingerprint).
- The clickable prototype in `prototype/views-and-ux/` is the primary source for layout and interaction detail; it is throwaway code and is not reused.
- The About dialog, tagline and README state "unofficial, community-made" and credit Matt Pocock's skills. No Waterworld imagery.

### Lifecycle, packaging and release (ADRs 0002, 0004)

- Quitting with live sessions, hidden ones included, shows a confirmation listing them, then stops them. Claims are kept and the sessions become paused.
- Quit and system shutdown share a hard 2-second budget, in this order: kill PTYs, flush the session index and UI state. Nothing is released at quit or shutdown.
- `electron-builder` targets: NSIS (Windows x64), DMG (macOS arm64 and x64), AppImage and deb (Linux x64). Unsigned in v1. Distribution through GitHub Releases plus build-from-source.
- `electron-updater` with `latest` and `beta` channels, default `latest`, checked at most daily plus on demand, applied on next quit. Auto-update on Windows NSIS and Linux AppImage; notify-only on macOS and deb.
- The `dryland` launcher ships in the install directory and is replaced on every update. Global `PATH` is opt-in (NSIS checkbox, a `dryland doctor` symlink on macOS/Linux, the deb's system link).
- App id `dev.dryland.ade`, repo `dryland-ade` (owner is a placeholder until upload).
- Project preparation (OSS files, issue and PR templates, SHA-pinned three-OS CI, tag-driven release, first-push secrets scan and squash, `v0.1.0-beta.1` first, `v1.0.0` after the Windows smoke checklist) follows the GitHub project preparation ticket and is part of v1.

## Testing Decisions

A good test here exercises behaviour through a public seam with realistic inputs and asserts what a user or agent would observe: the recommendation and its reason, the CLI's output and exit code, the resulting tracker state and commit. It does not assert on internal data structures, call order or file layout inside a package.

Seams, highest first. The aim is that almost everything is tested through the first two.

1. **The `dryland` CLI against a temp git repo** is the main seam for tracker behaviour. Run the real command, then assert on stdout/`--json`, exit code, the ticket files and the git log. Covers the local-markdown backend, locking, number allocation, pathspec commits, main-checkout resolution from a worktree, worktree create/prune rules and `doctor`. A parallel-claim test spawns N `dryland ticket claim` processes against one repo and asserts exactly one winner.
2. **The rule engine function** (snapshot in, ranked next steps out) is table-driven: one fixture snapshot per rule, asserting the recommended command, the priority order and the "why this next" text. Parsers feeding the snapshot are tested with fixtures taken from this repo's real `.scratch` files.
3. **The process-runner interface** is the only seam faked below the CLI. GitHub and GitLab backends run against recorded `gh`/`glab` JSON fixtures. No live network in CI.
4. **Agent adapter contract tests** use fake-CLI stub executables: assert the launch command, the pre-typed text (and that nothing is submitted), and that each native hook event produces the right session state through `dryland status` and the live-reporting listener.
5. **One Playwright-for-Electron smoke test**: launch, open a fixture repo, see the tickets tree, with a stub shell in place of a real agent. Runs on Windows in CI.

Other decisions:

- Vitest everywhere.
- Skill setup fingerprinting and verdict handling are tested through core functions with fixture skill directories (default, extras, modified).
- User-config writes (Copilot hook file, `trustedFolders`) are tested against a temp home directory: install, status, remove, and that removal restores the file byte-identically and unrelated keys are untouched.
- Shutdown ordering and the 2-second budget are tested in the main-process lifecycle module with a fake PTY provider and a slow index flush.
- A manual smoke checklist gates `v1.0.0`: real GitHub and GitLab, Claude Code and Copilot interactive trust prompt, install/uninstall, beta to latest auto-update, on Windows.
- Prior art: the repo has no code or tests yet. The fixtures are the existing `.scratch/mattpocock-ade/` map and tickets, the prototype's snapshot generator shows the snapshot shape, and the Copilot hook file shapes and observed event order are recorded in `research/hook-status-mapping.md`.

## Out of Scope

- Customized or modified skill setups beyond detect, warn and degrade. No AI-assisted adaptation, no per-skill customization.
- Updating Matt Pocock skills from Dryland; v1 only reports differences from the upstream mirror.
- Teams, multi-user collaboration, remote or cloud sessions.
- Claude API, Claude Agent SDK, and the headless structured (`stream-json`) mode.
- Forking Orca or reusing its app shell, relay or mobile code.
- A background daemon, and session processes surviving an app restart (sessions are resumed through the Agent CLI instead, ADR 0010).
- WSL as a PTY backend.
- User-editable next-step rules.
- An undo UI (git is the undo), webhooks, stored tracker tokens, an MCP server.
- Code signing and notarization.
- Any shipped ADE-owned annotation type.
- Trackers other than local-markdown, GitHub and GitLab.

## Further Notes

- **ADR set**: 0001 (tracker CLI as single write path), 0002 (desktop stack), 0003 (write policy and skill setup), 0004 (packaging and testing), 0005 (user-level agent-config exception), 0006 (Agent adapters and hook-sourced status), 0007 (next-step rule engine), 0008 (CLI surface, normalized ticket model, live reporting), 0009 (claim recorded as a Dryland annotation), 0010 (sessions paused and resumed through a session index). ADRs 0001 to 0004 predate the rename and carry a note that `ade` reads as `dryland`.
- **Glossary**: ticket kind, stale claim, next-up marker, live event and unlinked branch are defined in the root `GLOSSARY.md`.
- **Claude Code adapter verification** is the first implementation ticket of that adapter, not a separate wayfinding ticket.
- **Risks**:
  - The terms-of-service question for driving the Agent CLIs was addressed and decided. The README carries an agent-CLI terms reminder.
  - The Claude Code adapter design comes from documentation only; nothing about it has been verified empirically yet. The current dev machine has Claude Code (2.1.296) but not Copilot CLI, so Claude is verified first and locally: per-launch settings hook injection, the event-to-state mapping, the pre-typed unsubmitted command, and the interactive trust prompt.
  - The Copilot CLI adapter was verified on the earlier dev machine (tickets 17 and 19) but cannot be re-run on the current one. It is built from the recorded file shapes and event order and needs a machine with Copilot for the smoke checklist.
  - Claude Code's transcript format is unofficial and unstable, so transcripts are a best-effort fallback only.
  - Copilot CLI behaviour was verified on versions 1.0.95 and 1.0.96 on Windows only; newer versions may differ.
  - The name has had no formal trademark search.
- Suggested build order for slicing into tickets: core parsing and normalized model, then the `dryland` CLI with the local-markdown backend, then the rule engine, then the desktop shell with PTYs and the Claude Code adapter (the one verifiable on the current dev machine), then live reporting and status, with the first step there being to verify the documentation-only Claude column of the status mapping and the per-launch settings hook injection against the real CLI, then the Copilot CLI adapter (built from the recorded verification, re-checked on a machine that has Copilot), then GitHub/GitLab backends, then Source Control and merge/PR, then skill setup detection and Settings, then packaging and release.
