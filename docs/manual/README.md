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
2. Dryland reads the repo's maps and tickets from its state store. A repo without one gets `dryland init` as its next step; run it in the repo to create the store. The specs under `.scratch/<effort>/spec.md` stay ordinary files.
3. Open several projects at once. The project widget at the left of the top bar switches between them, and "all projects" lists every open project with its sessions. Each project keeps its own tabs; closing a project ends its sessions, which then show as paused.

Dryland reopens the projects you had open the next time it starts. The app refreshes by itself when the store changes, whoever wrote to it, and when a spec under `.scratch/` changes. The store lives in Dryland's data directory, outside the repo, and is bound to the repo by an id in its git config.
## The views

The activity bar on the left switches the main side panel.

- **Tickets** shows every map as a group of its tickets, with a status icon for each: ready, in progress, blocked or done. Done tickets fold into one line that expands. The next step is marked with a gold bar and a star, and its tooltip explains why. The "..." menu controls what the tree shows.
- **Maps** lists the maps with their progress and what is still fog (not yet specified).
- **Sessions** lists every live and paused session across ticket and scratch worktrees, with its Agent CLI, its state (working, waiting for you, idle, ended), how long it has been in that state, and its last output line. A badge on the activity icon counts the sessions that wait for you.

Alongside the side panel:

- **Explorer** browses the files of the worktree for the tab you are looking at, and opens files and diffs as tabs. **Source Control** shows that worktree's branch and changes, local merge and prune, and opens or links a pull or merge request through `gh` or `glab`.
- **Tabs** in the middle hold tickets, maps, files, diffs, terminals and sessions. A **terminal** tab is a plain shell; use **New terminal** in the top bar.
- The **status bar** summarises the sessions that need you.

## Starting work

Select a ticket and use its **Start work** buttons, for example **Start with Claude Code**.

1. Dryland creates (or reuses) the ticket's git worktree, named `<map>/<NN>-<slug>`, and claims the ticket.
2. It opens a terminal tab in that worktree running the Agent CLI, with the skill command for the ticket's kind typed in but **not submitted**. Read it, change it if you like, and press Enter yourself.
3. The session reports its state through the Agent CLI's hooks. Dryland shows it in the Sessions view and on the ticket.
4. Close a session's tab and its process keeps running as a hidden session; a hidden or paused session can be brought back from its ticket, its map or the Sessions view. **Sessions > Resume All Paused Sessions** brings them all back.
5. When the work is done, resolve the ticket with its button or the CLI, and merge or open a pull request from Source Control.

Writes to the store from a button ask for confirmation first; Settings > Write confirmations controls which. The first start with an Agent CLI may need a one-time change to that CLI's own config (for example trusting the folder or installing the status hooks); Dryland explains it and asks before it writes.

**File > New Scratch Session...** starts a session with no ticket in a scratch worktree, and **New Ticket...** and **New Map...** create tickets and maps in the store.

## The `dryland` CLI

The same operations are available from a terminal, and inside every session Dryland starts the `dryland` command is already on `PATH`. In the repository:

```text
dryland ticket list [--json]
dryland ticket show <map>/<number>
dryland ticket claim <map>/<number>
dryland ticket release <map>/<number>
dryland init [--bind <repo id> | --new-store]
dryland ticket create [--check] [--help]    # one JSON document on stdin
dryland ticket resolve <map>/<number> --answer <text> [--amend]
dryland ticket tick <map>/<number> --criterion <n>
dryland ticket block <map>/<number> [--add <number>,...] [--remove <number>,...]
dryland ticket comment <map>/<number> --text <text>
dryland ticket triage <map>/<number> --role <role>
dryland map show <map>
dryland map frontier <map>
dryland map create [--check] [--help]       # one JSON document on stdin
dryland worktree create [<map>/<number>] [--map <map>] [--slug <slug>]
dryland worktree list
dryland worktree prune <branch> [--yes]
dryland status <running|waiting|idle|ended> [--session <id>]
dryland doctor [--install-hooks | --remove-hooks | --link-path | --unlink-path]
```

Most commands accept `--json`. Creating a ticket or a map takes one JSON document on stdin, which is checked and applied in one step; `--check` stops before applying and `--help` prints the fields. Reads print a document by default, and `--text` renders it for people. `dryland doctor` checks the repo's skill setup and state store, `PATH` and the installed hooks, and its output belongs in a bug report. The CLI works with the app closed, because it only needs the repository. A repo without a store gets an error that names `dryland init`.

## Settings and About

**File > Settings...** (`Ctrl/Cmd+,`) has tabs for General, Agent CLIs, Write confirmations and Updates. **Help > About Dryland ADE** states what Dryland is: an unofficial, community-made project that credits Matt Pocock's skills.
