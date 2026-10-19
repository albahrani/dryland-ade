# Matt Pocock ADE

A desktop agent development environment that reads the artifacts of repos using the Matt Pocock skills and shows the user what to do next.

## Language

**ADE**:
The category: a desktop agent development environment, a lens over a repo's skill artifacts and git state, plus an actuator that launches agent CLI sessions.
_Avoid_: IDE, editor

**Dryland ADE**:
The product's official name; "Dryland" is its short form. An unofficial, community-made companion for Matt Pocock's skills.

**Skill workflow**:
The intended sequence of Matt Pocock skills and the artifacts they produce and consume (maps, tickets, specs, glossary, ADRs).
_Avoid_: Pipeline, process

**Map**:
A wayfinder index of decisions for one effort, with child tickets.
_Avoid_: Roadmap, plan

**Ticket**:
A unit of work or decision tracked on an issue tracker, local-markdown, GitHub or GitLab.
_Avoid_: Task, card

**Ticket kind**:
Where a map's item sits in the skill workflow: Fog (not yet specified on the map), Planning (grilling, research or prototype tickets) or Implementation (task tickets). Derived, never stored.
_Avoid_: Phase, stage, category

**Ticket status**:
What a ticket's icon shows: ready (open, unblocked, unclaimed), in progress (claimed), blocked (open with an unresolved or unknown blocker) or done (resolved). Derived from state and blockers, never stored.
_Avoid_: Ticket state (that is open, claimed, resolved)

**Frontier**:
The open, unblocked, unclaimed tickets of a map.
_Avoid_: Backlog, queue

**Claim**:
A mark on a ticket that someone is working on it, naming its holder (the branch the work happens on) and when it was made. Taken by `ticket claim`, undone by `ticket release`.
_Avoid_: Lock, assignment

**Stale claim**:
A claim with no live or paused session behind it and no ticket worktree on its branch; flagged as possibly stale and released only by an explicit user action.
_Avoid_: Orphaned ticket, expired lock

**Next step**:
The recommended skill and target artifact for the user to act on, derived by rules from artifact state.
_Avoid_: Suggestion, recommendation

**Next-up marker**:
The gold bar and star that mark the item a next step points at: a ticket, or the map itself when only fog remains.
_Avoid_: Highlight, badge

**Agent CLI**:
A terminal coding agent the ADE drives through its own subscription login, such as Claude Code or GitHub Copilot CLI.
_Avoid_: Agent API, SDK

**Session**:
An Agent CLI session: one conversation with an Agent CLI, kept by the CLI and resumable. It is live while its process runs in the ADE.
_Avoid_: Chat, run, conversation, work session

**Paused session**:
A session of a claimed ticket that is not live but that the ADE knows and can resume.
_Avoid_: Suspended, interrupted, closed session

**Hidden session**:
A live session whose tab is closed: its process keeps running and its output is kept, and it shows again from its ticket, map or the Sessions view.
_Avoid_: Background session, minimized session, closed session

**Scratch session**:
A session started with no ticket, from File ▸ New Scratch Session, in a new scratch worktree under the `scratch` map. It is linked to that worktree, not to a ticket.
_Avoid_: Free session, ad-hoc session

**Hand-started session**:
A session the user starts by typing the Agent CLI's command in a plain terminal tab. The ADE's launcher puts it on the status hooks, and links it to a ticket by the worktree it runs in, or shows it as unlinked when that is no Dryland worktree. It ends with its tab.
_Avoid_: Manual session, external session

**Session index**:
The ADE's machine-local record of which sessions belong to which ticket, map or scratch worktree, kept beside the repository's git data and never committed; a cache rebuilt where possible from the Agent CLIs.
_Avoid_: Session store, session database, session log

**Quit dialog**:
The in-app question asked when the user quits while sessions run: it lists the sessions that would stop, then shows each shutdown step's progress and offers Quit now. It has no time limit, unlike an OS-forced shutdown. When the window does not answer within about 2 seconds, a native message box asks instead.
_Avoid_: Quit confirmation, exit prompt

**OS-forced shutdown**:
A quit the operating system starts (shutdown, restart, log-off). It asks nothing and has a hard 2-second budget, after which the remaining steps are abandoned.
_Avoid_: System quit, forced quit

**Live event**:
A message the ADE's command-line tool sends to the running ADE when a session changes state or a ticket changes; shown live and never stored.
_Avoid_: Log entry, notification

**ADE tracker**:
The ticket-management mode in which all ticket and map-index changes go through the ADE's own command-line tool, which delegates to local-markdown, GitHub or GitLab.
_Avoid_: Custom tracker, wrapper

**Main checkout**:
The repo's primary working tree, where local-markdown tracker state lives so every session and the ADE see the same thing.
_Avoid_: Root, master copy

**Linked worktree**:
A git worktree or branch tied to a ticket by its `<map>/<NN>-<slug>` name, or failing that by a `Dryland-Ticket: <map>/<NN>` commit trailer.
_Avoid_: Ticket branch

**Scratch worktree**:
A worktree the ADE made without a ticket, named `<map>/scratch-<slug>`, for exploratory work. It has no ticket to resolve before it can be pruned.
_Avoid_: Temp worktree, sandbox

**Unlinked branch**:
A branch or worktree the ADE cannot tie to any ticket, because it matches neither the naming convention nor a commit trailer.
_Avoid_: Orphan branch, stray branch

**Agent adapter**:
The per-Agent-CLI description the ADE uses to launch a session, pre-type a skill command and observe its status.
_Avoid_: Driver, plugin

**Skill setup state**:
How the repo's installed skills and `docs/agents` files compare to the known default setup: default, default with extras, or modified.
_Avoid_: Skill version, config drift

**Compatibility verdict**:
An agent-written judgement, per ADE feature, of whether a modified skill setup still works with the ADE.
_Avoid_: Validation, lint result

**ADE-owned annotation**:
A clearly marked addition the ADE writes into a prose artifact for its own benefit, which the skills can ignore.
_Avoid_: Metadata block, tag
