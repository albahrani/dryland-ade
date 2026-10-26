# Matt Pocock ADE

A desktop agent development environment that reads the artifacts of repos using the Matt Pocock skills and shows the user what to do next.

## Language

**ADE**:
The category: a desktop agent development environment, a lens over a repo's skill artifacts and git state, plus an actuator that launches agent CLI sessions.
_Avoid_: IDE, editor

**Dryland ADE**:
The product's official name; "Dryland" is its short form. An unofficial, community-made companion for Matt Pocock's skills.

**Project**:
A repo opened in the ADE, shown by the folder name. Several can be open at once; one is shown at a time, each keeping its own tabs. Sessions of the other open projects keep running, and closing a project ends its sessions, which then read as paused sessions.
_Avoid_: Workspace, repo (for the open one)

**Skill workflow**:
The intended sequence of prompts derived from Matt Pocock's skills and the state and files they produce and consume (maps, tickets, specs, glossary, ADRs).
_Avoid_: Pipeline, process

**Map**:
The engine's record of one effort: a Destination (human-only edits), Notes, fog items, out-of-scope items and child tickets, with a status of charting or done. Decisions so far is derived from its resolved tickets.
_Avoid_: Roadmap, plan

**Ticket**:
The engine's record of one unit of work or decision, with a Report, an Analysis log, a Description and a Solution summary, and a status of open, claimed or resolved.
_Avoid_: Task, card

**Report**:
The question or request a ticket starts from. Fixed once the ticket is claimed; only a human edits it, and each edit is a revision.
_Avoid_: Body, question

**Analysis log**:
A ticket's append-only list of typed entries (finding, failed-attempt, correction, retraction). A correction or retraction points at an earlier entry with a one-line reason; retracted entries are struck and collapsed, never deleted.
_Avoid_: Comments, notes

**Description**:
A ticket's current state in three sections: Problem, Cause (required for bugs) and Plan. Resolve requires Problem and Plan.
_Avoid_: Body, details

**Solution summary**:
The short text that closes a ticket, within its cap. It feeds Decisions so far and release notes.
_Avoid_: Answer, resolution

**Revision**:
One entry in a field's history, with time, author kind and an optional reason. Every edit appends one.
_Avoid_: Version, edit

**Author kind**:
Who wrote a revision or entry: human, agent or engine.
_Avoid_: Author, actor

**Reopen**:
Returning a resolved ticket to open, with a reason, by an agent or a human. The old summary stays as a superseded revision, a correction entry is added, and a reopened badge stays until a human dismisses it.
_Avoid_: Undo, unresolve

**Unslop**:
The command that proposes a denser rewrite of a field. A human sees a word-level diff and the character count against the cap, and accepts only after three ticks (clear, dense, nothing cut). A workflow-triggered unslop, such as in migration, applies unattended and is marked agent-authored.
_Avoid_: Summarize, shorten

**Suggest**:
The button beside a hand-written one-liner that drafts a version within the cap, using a read-only agent prompt. An accepted draft is saved as human-authored.
_Avoid_: Autocomplete, rewrite

**Ticket kind**:
Where a map's item sits in the skill workflow: Fog (not yet specified on the map), Planning (grilling, research or prototype tickets) or Implementation (task tickets). Derived, never stored.
_Avoid_: Phase, stage, category

**Ticket status**:
What a ticket's icon shows: ready (open, unblocked, unclaimed), in progress (claimed), blocked (open with an unresolved blocker) or done (resolved). Derived from state and blockers, never stored.
_Avoid_: Ticket state (that is open, claimed, resolved)

**Acceptance criterion**:
One checkbox in a ticket's acceptance criteria, numbered from 1 in order whether ticked or not. Ticked by `ticket tick --criterion <n>`.
_Avoid_: Checklist item, requirement

**Amend**:
Replacing the Solution summary of an already resolved ticket, with a required reason, which appends a revision. A resolved ticket changes only by amend or reopen.
_Avoid_: Edit, re-resolve

**Workflow engine**:
The deterministic part of Dryland that owns maps, fog, tickets, comments and the rules of the skill workflow, as opposed to the agents that run prompts under it. Under the rework it is the source of truth for that state, not a reader of files that skills write.
_Avoid_: Backbone, tracker logic

**Fog item**:
One record on a map: an area or question too coarse to ticket yet, in one sentence. It is open, graduated to a ticket (one atomic command that creates the ticket, wires its blockers and removes the item) or dropped with a reason.
_Avoid_: Fog ticket, TODO

**Prompt**:
What Dryland sends an agent to run one step of the workflow. It may be derived from an upstream Matt Pocock skill; where Dryland owns the text, it is a prompt, not a skill.
_Avoid_: Skill (for text Dryland owns), template

**Frontier**:
The open, unblocked, unclaimed tickets of a map.
_Avoid_: Backlog, queue

**Claim**:
An event on a ticket that someone is working on it, naming its holder (the branch the work happens on) and when it was made. Required before work; taken by `ticket claim`, undone by `ticket release`. The first claim to reach the state remote wins; an offline claim is provisional.
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
A session state report (running, waiting, idle or ended) that an Agent CLI's hook sends through `dryland` to the running ADE; it carries no payload.
_Avoid_: Log entry, notification

**Main checkout**:
The repo's primary working tree, whose git common dir holds the machine-local session index and cache that every session and the ADE share.
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
The per-Agent-CLI description the ADE uses to launch a session, pre-type a prompt command and observe its status through hooks. Only Claude Code and GitHub Copilot CLI have one.
_Avoid_: Driver, plugin

**Isolation level**:
The user's choice of how strongly an agent session is kept from the host and from tracker state: Off, Guarded (the agent CLI's own permission rules plus the engine's checks) or Contained (the agent CLI runs in a container that mounts only the session's worktree).
_Avoid_: Sandbox mode, security level

**Access request**:
An agent's ask, with a reason, for access its session profile denies. The human answers deny, deny and never ask again, allow once, allow for the session, or allow always; with no human present the session ends as blocked.
_Avoid_: Override, escalation

**Violation**:
A recorded event where an agent changed tracker state outside the engine; the engine reverts the change and tells the agent.
_Avoid_: Breach, incident

**State store**:
The engine's record of tickets, maps, fog and attachments, kept as an append-only log of events on a dedicated git ref that is never checked out; the only source of truth for tracker state.
_Avoid_: Database, tracker files

**Event**:
One immutable entry in the state store (a claim, a revision, an analysis entry, a resolve); current state is derived by replaying events.
_Avoid_: Change, record

**State remote**:
The git remote the state store syncs to: none (local-only), `origin`, or a separate repo such as a private one shared by a team.
_Avoid_: Backend, tracker remote

**Prompt set**:
The prompts a Dryland release ships, generated from a pinned snapshot of the upstream skills plus Dryland's overlays, and tied to that release.
_Avoid_: Skill pack, bundle

**Overlay**:
Dryland's own change to one upstream prompt: swapping tracker operations for engine commands, adding engine facts, or adding style rules. It never rewrites upstream's judgement content.
_Avoid_: Fork, patch

**Override**:
A user's replacement of a shipped prompt, or text appended to it, at the global or repo layer. An expert feature; the engine's checks apply regardless.
_Avoid_: Customization, plugin
