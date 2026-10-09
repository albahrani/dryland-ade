# Verify Copilot hook and trust setup end to end

Type: task
Status: open
Blocked by:

## Question

Decided: v1 accepts narrow user-config writes (see map Notes). Human/agent checklist: on the dev machine, verify the Orca-style path end to end for Copilot CLI: (1) a dedicated `~/.copilot/hooks/<ade>.json` hook fires in a worktree under `copilot -p` and interactive mode, inert when env vars are absent; (2) appending the worktree realpath to `trustedFolders` suppresses the trust prompt; (3) remove restores the prior state. Record the result and exact file shapes in research/hook-status-mapping.md. Back up `~/.copilot/config.json` first.


