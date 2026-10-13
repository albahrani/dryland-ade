# Narrow, Dryland-owned writes to user-level agent config are allowed

The original rule was that the ADE never touches user-level Agent CLI config, and injects status hooks only per launch or per worktree. That works for Claude Code (a per-launch settings flag) but not for Copilot CLI: it has no hooks-only flag, worktree-local `.github/hooks` did not fire in an untrusted worktree, and every new worktree raises a trust prompt. Reliability beats purity, so Dryland may make narrow, Dryland-owned, reversible writes to user-level agent config where that is what makes status hooks and first-launch trust work. Per-launch or worktree-local injection stays preferred wherever a CLI offers it. Rewriting the user's main settings file, as most peer tools do with `~/.claude/settings.json`, stays rejected. Orca is the prior art for the accepted shape.

## Decisions

- **Copilot CLI hooks**: one dedicated hook file in the user's Copilot hooks directory, owned by Dryland and coexisting with the user's other hook files. Every hook is gated on an environment variable (`DRYLAND_PANE_KEY`) set only on PTYs Dryland spawns, so the file is inert in every other terminal.
- **Copilot CLI trust**: Dryland appends the realpath of each worktree it creates to `trustedFolders` and removes it again when the worktree is pruned.
- **Rules for every such write**: touch only Dryland's own file or Dryland's own entries; never rewrite unrelated keys; skip (and report) when the file cannot be parsed; honour the CLI's own config lock file and tolerate the CLI rewriting the file.
- **Reversibility**: `dryland doctor` and the Agent CLIs settings tab offer install, status and remove. Remove restores the prior state.
- **Consent**: a Dryland-owned user-config write is its own confirmation type with a "do not ask again" flag (ADR 0003).
- **Other Agent CLIs**: the same exception applies where it simplifies hooks, under the same rules.

## Consequences

- Supersedes the "never user-level config" wording in the adapter and hook-management tickets.
- Verified for Copilot CLI 1.0.95 and 1.0.96 on Windows in both `-p` and interactive mode: the hooks fire, are inert without the variable, the trust entry suppresses the prompt, and removal restores `config.json` byte-identically.
- Uninstalling Dryland without running remove leaves an inert hook file and stale trust entries behind; the uninstall notes say so.
