# Verify Copilot hook and trust setup end to end

Type: task
Status: resolved
Blocked by:

## Question

Decided: v1 accepts narrow user-config writes (see map Notes). Human/agent checklist: on the dev machine, verify the Orca-style path end to end for Copilot CLI: (1) a dedicated `~/.copilot/hooks/<ade>.json` hook fires in a worktree under `copilot -p` and interactive mode, inert when env vars are absent; (2) appending the worktree realpath to `trustedFolders` suppresses the trust prompt; (3) remove restores the prior state. Record the result and exact file shapes in research/hook-status-mapping.md. Back up `~/.copilot/config.json` first.

## Answer

Verified on Windows, Copilot CLI 1.0.95, temp repo + `git worktree add`, `config.json` backed up first. Exact file shapes in `research/hook-status-mapping.md` (section "Verification").

- **(1) Global env-gated hook, `-p` mode: works.** `~/.copilot/hooks/<ade>.json` (`version: 1`, camelCase events, `powershell` command, `timeoutSec: 5`) fired `sessionStart`, `agentStop`, `sessionEnd` in the worktree. Inert without `ADE_PANE_KEY` (no output, no error). Coexists with other user hook files.
- **Trust is not needed for user-level hooks** under `-p`: they fired with the worktree absent from `trustedFolders`.
- **(2) Trust append: clean.** Appending the worktree realpath to `trustedFolders` kept valid JSON with all other keys untouched. A `config.json.trusted-folders.lock` exists; the ADE should honour it and tolerate Copilot rewriting the file.
- **(3) Remove: clean.** Removing the entry restored the prior state exactly.
- **Not verified:** hook firing and trust-prompt suppression in **interactive** mode (no headless way to drive the TUI). Follow-up: [Verify Copilot hooks and trust prompt in interactive mode](19-verify-copilot-interactive-mode.md).
- Gotcha: closing the `-p` stdout pipe early (e.g. `Select -First N`) truncates hook events.


