# Hook-event-to-status mapping and Copilot worktree hooks

Type: research
Status: resolved
Blocked by: 

## Question

For Claude Code and GitHub Copilot CLI, which hook events map to the ADE session states (running / waiting for input / idle / ended)? Verify empirically on the dev machine (Copilot available) whether a worktree-local .github/hooks/*.json is resolved when Copilot CLI runs inside a git worktree. Document the mapping table and fallbacks in .scratch/mattpocock-ade/research/hook-status-mapping.md.



## Answer

Findings: `.scratch/mattpocock-ade/research/hook-status-mapping.md`.

Gist: both CLIs have a documented Notification-style event with a type (permission prompt / needs input = waiting, idle = idle), plus Stop/agentStop = idle and SessionEnd/sessionEnd = ended; Copilot does have a waiting-for-input event, correcting the earlier assumption. Worktree-local `.github/hooks` resolution was NOT confirmed: in `copilot -p` the hook did not fire, likely due to folder trust (`trustedFolders`) with no TTY to prompt. Follow-up: ticket 17.

