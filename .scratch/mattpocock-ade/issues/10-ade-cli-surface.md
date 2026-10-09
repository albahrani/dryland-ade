# ade CLI surface, normalized ticket model and live reporting

Type: grilling
Status: resolved
Blocked by:

## Question

Define the `ade` CLI surface (commands for tickets, map index, claims, worktree creation, reporting), the normalized ticket/map model the rule engine and UI consume (blocking/claim fallbacks per local-markdown, GitHub, GitLab), and the live-reporting channel over localhost (event schema, auth, silent no-op when the ADE is closed, what the ADE shows). Builds on the decisions for parallel work (ADR 0001), adapters, and the rule engine.


## Answer

- **Commands** (all support `--json`, non-zero exit on failure): `ade ticket` (create, list, show, claim, release, resolve, block, comment), `ade map` (show, frontier, index), `ade worktree` (create, list, prune), `ade status` (report session events; called by hooks), `ade doctor` (setup, tracker, hooks, PATH check).
- **Output**: default short plain text written for agents; `--json` for the ADE and hooks; errors state the next action.
- **Normalized ticket model**: id, title, type (research/prototype/grilling/task or none), state (open/claimed/resolved), claimant, blockers (known/unknown), parent map, triage role, body, answer, comments; backend extras in an opaque `raw` field the rules never read.
- **Local-markdown format**: unchanged from the default skills (`Type:`, `Status:`, `Blocked by:`, `## Answer`, `## Comments`); `ade` adds no fields so files stay hand-readable and skill-compatible.
- **Live reporting**: ADE listens on `127.0.0.1` on a random port; port plus random per-launch token in a lock file in a per-user app dir; `ade status` POSTs authenticated, exits 0 silently if no lock file or connection fails. ADE-spawned sessions get `ADE_PORT`, `ADE_TOKEN`, `ADE_SESSION_ID`.
- **Events**: JSON `{session_id, kind, timestamp, payload?}`; kinds `session.started|running|waiting|idle|ended` and `ticket.changed` (emitted by every mutating `ade ticket`/`ade map` command). Hooks map each CLI's native events to session kinds.
- **ADE display**: session list shows status and linked ticket; tickets refresh on `ticket.changed`; GitHub/GitLab polled on focus/timer; events not stored, state rebuilt from files, git and tracker on start.
- **Backend gaps**: GitLab without Premium keeps blocking in a `Blocked by:` body line; GitHub/GitLab claim = assignee; missing/unauthenticated `gh`/`glab` reported by `ade doctor` and clear failures, never prompting for or storing tokens.