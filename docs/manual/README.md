# Dryland ADE user manual

Dryland ADE is an unofficial, community-made desktop app for repos that use Matt Pocock's skills. This manual covers what exists today. Each topic has its own `##` section, so a later feature adds a section or a page beside these.

- [Opening a project](#opening-a-project)
- [The views](#the-views)
- [Starting work](#starting-work)
- [The `dryland` CLI](#the-dryland-cli)
- [Settings and About](#settings-and-about)

## Opening a project

A **project** is a git repository you open in Dryland.

1. Start Dryland and choose **Open project...** (also **File > Open Project...**, `Ctrl/Cmd+O`), then pick the repository's folder.
2. Dryland reads the repo's tracker from `docs/agents/issue-tracker.md` and shows its maps and tickets. If the repo has no tracker doc, the Tickets view says so.
3. Open several projects at once. The project widget at the left of the top bar switches between them, and "all projects" lists every open project with its sessions. Each project keeps its own tabs; closing a project ends its sessions, which then show as paused.

Dryland reopens the projects you had open the next time it starts. For a repo with local markdown tickets, the app refreshes by itself when files in `.scratch/` change. A GitHub or GitLab tracker is read through `gh` or `glab`, so those need to be installed and logged in.

## The views

The activity bar on the left switches the main side panel.

- **Tickets** shows every map as a group of its tickets, with a status icon for each: ready, in progress, blocked or done. Done tickets fold into one line that expands. The next step is marked with a gold bar and a star, and its tooltip explains why. The "..." menu controls what the tree shows.
- **Maps** lists the maps with their progress and what is still fog (not yet specified).
- **Sessions** lists every live and paused session across ticket and scratch worktrees, with its Agent CLI, its state (working, waiting for you, idle, ended), how long it has been in that state, and its last output line. A badge on the activity icon counts the sessions that wait for you.

Alongside the side panel:

- **Explorer** browses the files of the worktree for the tab you are looking at, and opens files and diffs as tabs. **Source Control** shows that worktree's branch and changes, local merge and prune, and opens or links a pull or merge request through `gh` or `glab`.
- **Tabs** in the middle hold tickets, maps, files, diffs, terminals and sessions. A **terminal** tab is a plain shell; use **New terminal** in the top bar.
- The **live-events panel** at the bottom shows what the CLI reported just now: a session changing state, a ticket changing. It can be expanded, reduced to the newest line, or hidden.
- The **status bar** summarises the sessions that need you.

## Starting work

Select a ticket and use its **Start work** buttons, for example **Start with Claude Code**.

1. Dryland creates (or reuses) the ticket's git worktree, named `<map>/<NN>-<slug>`, and claims the ticket.
2. It opens a terminal tab in that worktree running the Agent CLI, with the skill command for the ticket's kind typed in but **not submitted**. Read it, change it if you like, and press Enter yourself.
3. The session reports its state through the Agent CLI's hooks. Dryland shows it in the Sessions view and on the ticket.
4. Close a session's tab and its process keeps running as a hidden session; a hidden or paused session can be brought back from its ticket, its map or the Sessions view. **Sessions > Resume All Paused Sessions** brings them all back.
5. When the work is done, resolve the ticket with its button or the CLI, and merge or open a pull request from Source Control.

Writes to the tracker from a button ask for confirmation first; Settings > Write confirmations controls which. The first start with an Agent CLI may need a one-time change to that CLI's own config (for example trusting the folder or installing the status hooks); Dryland explains it and asks before it writes.

**File > New Scratch Session...** starts a session with no ticket in a scratch worktree, and **New Ticket...** and **New Map...** create tracker items.

## The `dryland` CLI

The same operations are available from a terminal, and inside every session Dryland starts the `dryland` command is already on `PATH`. In the repository:

```text
dryland ticket list [--json]
dryland ticket show <map>/<number>
dryland ticket claim <map>/<number>
dryland ticket release <map>/<number>
dryland ticket create --map <map> --title <title> --type <type> [--question <text>] [--blocked-by <number>,...]
dryland ticket resolve <map>/<number> --answer <text> [--amend]
dryland ticket tick <map>/<number> --criterion <n>
dryland ticket block <map>/<number> [--add <number>,...] [--remove <number>,...]
dryland ticket comment <map>/<number> --text <text>
dryland ticket triage <map>/<number> --role <role>
dryland map show <map>
dryland map frontier <map>
dryland map index <map> --title <title> --link <path> --gist <text>
dryland worktree create [<map>/<number>] [--map <map>] [--slug <slug>]
dryland worktree list
dryland worktree prune <branch> [--yes]
dryland status <kind> [--session <id>] [--payload <json>]
dryland doctor [--install-hooks | --remove-hooks | --compat-prompt]
```

Most commands accept `--json`, and the writing ones accept `--commit` or `--no-commit` to commit the tracker change or leave it. `dryland doctor` checks the repo's tracker doc, skill setup and installed hooks, and its output belongs in a bug report. The CLI works with the app closed, because it only needs the repository.

## Settings and About

**File > Settings...** (`Ctrl/Cmd+,`) has tabs for General, Agent CLIs, Tracker, Skills, Write confirmations and Updates. A setting says whether it applies to every project or only to the open one. **Help > About Dryland ADE** states what Dryland is: an unofficial, community-made project that credits Matt Pocock's skills.
