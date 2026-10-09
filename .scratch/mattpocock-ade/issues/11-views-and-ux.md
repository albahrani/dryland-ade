# Views and UX

Type: prototype
Status: resolved
Blocked by:

## Question

Which screens does the ADE have (map/frontier board, ticket detail with next-step "why", worktree/branch graph in feature context, session list with terminals) and how do they feel? Make a cheap clickable UI prototype to react to, covering how git is shown in the context of features, tickets and maps and how the recommended skill command is pre-typed into a session.

## Answer

Verdict after six prototype rounds (HITL): a **VS Code-style IDE shell**, throwaway prototype kept as a primary source at `.scratch/mattpocock-ade/prototype/views-and-ux/index.html` (real project data via `data.js`, sample scenarios via `scenarios.js`, snapshot generator `gen-data.js`).

**Layout**
- Menu bar (File/Edit/View/Go/Session/Help) with a prominent IntelliJ-style project widget; tracker widget top right; status bar with the selected agent's state and live/total session counts. No global branch selector: branch belongs to a worktree (ticket or session) and is shown in the status bar and Source Control.
- Left activity bar with Tickets, Maps and Sessions views; middle editor tabs; right Explorer and Source Control tabs; collapsible bottom live-events panel (expanded, one line, hidden).
- Selecting a ticket, map or session drives all panes (terminal, details, worktree files, git, events).

**Tickets tree**
- Maps are the grouping elements. Under each map two independent axes: *kind* (static, from the workflow: Fog, Planning = grilling/research/prototype, Implementation = tasks) groups the rows; *status* (ready, in progress, blocked, done) is shown only as an icon. Done tickets fold into one "N done" line.
- Next-up candidates: gold left bar plus a star (on a ticket, or on the map when only fog remains). Hover gives a textual "why this next".
- Maps tab: one compact row per map with stacked progress bar; selecting shows a stats card and "Continue map".
- Sessions tab: grouped by map (alternatives: agent, state, none) with an "Unlinked" group.

**Middle area**
- Editor tabs for tickets, maps, sessions, file contents and diffs. Ticket/map tabs have a collapsible details header (one line with type, status, next-up, session) above the agent terminal; unlinked sessions get a static title plus an "unlinked" marker.
- No terminal yet: agent CLI selector; opening creates a worktree and pre-types the recommended command, never auto-submitted. Ended sessions are read-only transcripts.

**Git in context**
- Source Control view as in VS Code: branch, commit box, staged/changes lists, commit graph, scoped to the selected ticket's or session's worktree; changed files open diff tabs, Explorer files open content tabs.

**Indicators and interaction**
- Agent icons (Claude, Copilot, Codex, Gemini, OpenCode) with a small state badge (working arc, waiting bubble, idle dash, ended square) instead of coloured circles; ticket status icons; legend shown initially (dismissible); text tooltips on all indicators.
- Every view has inline icons and a "..." menu (expand/collapse, sort, filters, grouping, show done/fog, close others/all, reopen closed tab, stage all, ...). Thin dark overlay scrollbars.
- Tracker widget opens tracker-specific actions: local-markdown reveals the issues folder or opens it in VS Code; GitHub/GitLab open issues in the browser.

Dropped: IntelliJ-style (stripes) and Eclipse-style (stacked views) layouts, flat ticket lists, per-map description text in the Maps tab.

