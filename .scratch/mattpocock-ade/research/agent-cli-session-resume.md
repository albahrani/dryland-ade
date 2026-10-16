# Agent CLI session ids and resume

Research for ticket `mattpocock-ade/70` (feeds ADR 0010, the session index). Scope: Claude Code and GitHub Copilot CLI. Researched 2026-10-16.

- **Claude Code**: official docs at `code.claude.com/docs` plus the official changelog, checked against the locally installed **Claude Code 2.1.301** on Windows (`claude --help`, three short runs with no model turn, file names and timestamps under `~/.claude/projects`; no transcript contents were read).
- **Copilot CLI**: docs only, **unverified locally** (not installed). Sources are GitHub Docs (fetched as article bodies) and the official `github/copilot-cli` changelog, whose newest entry was 1.0.98 (2026-10-14).

Main sources:

- CC-sessions: <https://code.claude.com/docs/en/sessions>
- CC-cli: <https://code.claude.com/docs/en/cli-reference>
- CC-env: <https://code.claude.com/docs/en/env-vars>
- CC-hooks: <https://code.claude.com/docs/en/hooks>
- CC-headless: <https://code.claude.com/docs/en/headless>
- CC-changelog: <https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md>
- GH-cmd: <https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference>
- GH-dir: <https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference>
- GH-hooks: <https://docs.github.com/en/copilot/reference/hooks-reference>
- GH-data: <https://docs.github.com/en/copilot/concepts/security-governance-and-network-settings/session-data>
- GH-changelog: <https://github.com/github/copilot-cli/blob/main/changelog.md>

---

## Q1. Is the session id exposed to child processes and hooks, and does it change on /clear, compaction or resume?

### Claude Code

- **Child processes.** `CLAUDE_CODE_SESSION_ID` is documented (CC-env): "Set automatically to the current session ID in Bash and PowerShell tool subprocesses, hook command subprocesses, and stdio MCP server subprocesses. For Bash, PowerShell, and hooks this matches the `session_id` field in the hook JSON input and **is updated on `/clear`**. An MCP server subprocess retains the ID it was spawned with. On `--resume <session-id>` it receives the resumed ID, matching hooks and Bash. On `--continue` or `--resume` without an explicit ID it [the MCP server] may receive the initial startup ID instead." It was added to Bash in 2.0.73, to stdio MCP servers in 2.1.132 and made consistent on `--resume` in 2.1.163 (CC-changelog).
- **Hooks.** Every hook gets `session_id` and `transcript_path` on stdin (CC-hooks, "Common input fields").
  - `SessionStart.source` is one of `startup`, `resume`, `clear`, `compact` or `fork`; before 2.1.214, a fork reported `resume`.
  - `SessionEnd` matcher values are `clear`, `resume`, `logout`, `prompt_input_exit` and `other`.
- **On /clear:** a new session id. The docs say "Claude Code saves the previous session; resume it with `/resume`" (CC-sessions), and the env var follows the new id (above).
- **On compaction:** the id stays the same. Compaction fires `PreCompact`/`PostCompact` and `SessionStart` with `source: "compact"`. The docs list `/clear` as the only event that updates the id, and describe compaction as keeping the session going ("a full context window doesn't end your session"). No page states outright that the id is unchanged.
- **On resume:**
  - The id stays the same unless `--fork-session` or `/branch` is used. Those give the copy "their own session IDs" (CC-sessions, CC-cli `--fork-session`: "create a new session ID instead of reusing the original").
- **Verified locally (2.1.301):**
  - This agent's own Bash environment has `CLAUDE_CODE_SESSION_ID`. It is the parent session's id, so subagents inherit the parent session's id and do not get one of their own.
  - Subagent transcripts are stored under `<session-id>/subagents/agent-<id>.jsonl`.
  - The variable's change after `/clear` was **not** checked with a live run. The docs state it explicitly.

### Copilot CLI (unverified)

- **Child processes.** `COPILOT_AGENT_SESSION_ID`: "Shell commands and MCP servers now receive COPILOT_AGENT_SESSION_ID as an environment variable" (GH-changelog 1.0.29, 2026-04-16). It is **not** listed in the GH-cmd environment variable table, which only lists variables the user sets. The docs do not say whether it is updated after `/clear`.
- **Hooks.** Every payload carries `sessionId` (or `session_id` in the VS Code-compatible format).
  - `sessionStart.source` is `"startup" | "resume" | "new"`, with no `clear` or `compact` value.
  - `sessionEnd.reason` is `"complete" | "error" | "abort" | "timeout" | "user_exit"` (GH-hooks).
- **On /clear:** a new session. "`/clear` closes the old session and fires its `sessionEnd` hooks with `reason: "user_exit"` while the CLI keeps running. The replacement session has its own independent lifecycle" (GH-hooks).
  - Since 1.0.11, `/clear` "abandons the current session entirely, while `/new` starts a fresh conversation (keeping the old session backgrounded)" (GH-changelog).
  - The GH-cmd table still lists `/clear`, `/new` and `/reset` as aliases for "Start a new conversation".
- **On compaction:** there is a `preCompact` hook, but `sessionStart` has no `compact` source. That suggests compaction keeps the session and its id. Not stated.
- **On resume:** the same id is kept. Sessions are stored per id and `--resume=<id>` resumes that one; `/restart` and `/update` "preserve the current session ID" (GH-changelog 1.0.49). `/session id` shows the current id (1.0.49).

## Q2. Resuming by id interactively, and what an unknown id does

### Claude Code

- **Resume by id.** `claude --resume <session-id>`, or `-r`, also accepts a name or the absolute path of a `.jsonl` file (CC-cli, CC-sessions).
- **Where it looks.** The id lookup searches "the current project directory and its git worktrees", then "every other project on this machine" (since 2.1.223). The cross-project match only counts if exactly one other project holds that id.
- **What is restored.** Resuming from a terminal restores the permission mode, model and agent. `--mcp-config`, `--settings`, `--plugin-dir` and `--add-dir` must be passed again (CC-sessions).
- **Running background session.** If the id belongs to a background session that is still running, `--resume` attaches to it instead (since 2.1.285).
- **Unknown id.** "If no stored session matches the ID, Claude Code reports `No conversation found with session ID: <session-id>`" (CC-sessions). **Verified:** `claude -p --resume <unknown-uuid> "hi"` printed exactly that and **exited 1** without calling the model. The interactive form was not run; the docs give the same message.
- **Pruned transcripts.** Transcripts are pruned after `cleanupPeriodDays`, 30 days by default. After that, an id in the index resolves to "not found".

### Copilot CLI (unverified)

- **Resume by id.** `copilot --resume=<value>`, or `-r`. The value can be "a session ID, ID prefix, or session name", and prefixes of 7 or more hex characters work (GH-cmd, GH-changelog 1.0.35). Inside a session, `/resume [SESSION-ID]` or `/continue [SESSION-ID]`.
- **The bare picker.** A bare `--resume` opens a picker, which needs a TTY. Without one and with several sessions, "the CLI exits with an error instead of silently starting a new session".
- **Unknown id: no error.**
  - "`--resume` creates new sessions with provided UUID" (GH-changelog 0.0.407).
  - For `--session-id`: "If nothing matches, a new session is created only when the value is a valid UUID. Names and ID prefixes do not create new sessions" (GH-cmd).
  - So an unknown UUID silently starts an **empty session under that id**.
  - The docs do not say what an unknown name or prefix does with `--resume`; probably an error.

## Q3. Can the session id be chosen at launch?

- **Claude Code:** yes. `claude --session-id <uuid>`: "Use a specific session ID for the conversation (must be a valid UUID)" (CC-cli).
  - **Verified:** a non-UUID gives `Error: Invalid session ID. Must be a valid UUID.` and exit 1.
  - It can be combined with `--resume`/`--continue` plus `--fork-session` to name the fork (CC-changelog).
  - What happens when the UUID is **already in use** is not documented and was not tested; a test could have written into a live transcript.
- **Copilot CLI:** yes. `--session-id ID` resumes the session if it exists, otherwise creates a new session with that id if it is a valid UUID (GH-cmd, GH-changelog 1.0.51). Do not combine it with `--resume`, `--continue` or `--connect`. Combining it with `--name` on an existing session is an error (1.0.71).

## Q4. Where session history is kept per working directory, and what can be read without the transcript format

### Claude Code

- **Location.** Transcripts are `~/.claude/projects/<project>/<session-id>.jsonl`. `<project>` is "your working directory path with non-alphanumeric characters replaced by `-`". Converted names longer than 200 characters are truncated and given "a hash of the full path", and that hash algorithm is not documented. The root moves with `CLAUDE_CONFIG_DIR`, and `CLAUDE_CODE_PROJECT_DIR_NAME` pins the project directory name (CC-sessions).
- **Contents are internal.** "The entry format is internal to Claude Code and changes between versions" (CC-sessions).
- **Retention.** 30 days via `cleanupPeriodDays`. `claude purge` deletes a project's transcripts.
- **Worktrees.** Each worktree path is its own `<project>` directory. Verified locally: `T--Development-mattpocock-ide` and `T--Development-mattpocock-ide-worktrees-hook-verify`.
- **Readable without parsing.** File name means session id, mtime means last activity, size is available too. Next to the transcripts sit `<session-id>/` folders (`subagents/`, `tool-results/`) and a `memory/` folder. These are not sessions.
- **Sessions that leave their directory.** A session moved with `/cd`, or resumed from another directory, lives in that directory's project folder.

### Copilot CLI (unverified)

- **Location.** `~/.copilot/session-state/`, or `$COPILOT_HOME/session-state/`, "organized by session ID in subdirectories. Each session directory stores an event log (`events.jsonl`) and workspace artifacts (plans, checkpoints, tracked files)" (GH-dir).
- **Session store.** `~/.copilot/session-store.db` is "A SQLite database … for cross-session data such as checkpoint indexing and search … should not be edited". It can be rebuilt with `/chronicle reindex` (GH-dir, GH-data). Its schema is not documented.
- **Not per directory.** Storage is not split by working directory. Mapping a session to a cwd needs either `events.jsonl` or the session store, and neither format is documented. Without parsing, all you get is session ids (folder names) and mtimes.
- **The CLI's own picker.** It does rank by cwd ("Scores sessions by match to the current working directory").
- **Retention.** No automatic retention is documented. There are `/session cleanup`, `/session prune` and `/session delete`, and sessions sync to the GitHub account by default (GH-data).

## Q5. Continue or resume when there is nothing to resume

### Claude Code

- **`claude -p --continue` with no session:** **verified** that it starts a fresh session with a new id and no error. The run was in an empty directory, with the API pointed at a dead port so no tokens were spent: `system/init` came back with a new `session_id`, then `api_retry`.
- **Interactive `claude --continue` with nothing to continue:** not documented and not tested. Probably the same; treat as unverified.
- **`claude --resume` picker with no sessions:** not documented or tested.
- **Sessions `--continue` skips.** It ignores `-p`/SDK/`/loop` sessions. If the latest session is still running in the background, it exits with `Your most recent conversation is running in the background` (CC-sessions).
- **Nested sessions.** A `claude` started with `CLAUDE_CODE_CHILD_SESSION=1` inherited (from inside another Claude Code session) "is automatically excluded from `--resume`, `--continue`, up-arrow history", and transcript persistence is off unless `CLAUDE_CODE_FORCE_SESSION_PERSISTENCE=1` (CC-env).

### Copilot CLI (unverified)

- **`--continue` falls back globally.** It means "Resume the most recent session in the current working directory, **falling back to the globally most recent session**" (GH-cmd). With no session in the directory, it opens some other project's session.
- **No sessions at all:** behaviour is not documented.
- **Cancelling the picker.** Cancelling the `--resume` picker starts a new session (GH-changelog 0.0.404).

---

## Consequences for ADR 0010

1. **Resume by id works for both CLIs, but they fail differently.**
   - Claude Code refuses an unknown id with exit 1 and `No conversation found…`. Dryland can catch that and fall back.
   - Copilot **silently starts an empty session under that UUID**. Before running `copilot --resume=<id>`, Dryland must check that `session-state/<id>/` exists. Otherwise the fallback chain never fires, and the index "resumes" into a blank conversation.
   - Pruned Claude transcripts (30 days, the same as the ADR's retention default) also become "not found". Resume should check that the transcript file exists first.
2. **`/clear` changes the id, and child processes see the new one (Claude Code, documented).**
   - A `dryland ticket` command run after `/clear` reports the new id, and the old one stays resumable. The index will gather several sessions per item, which fits "known sessions, newest first".
   - Hooks see the change as `SessionEnd(clear)` followed by `SessionStart(clear)` with the new `session_id`.
   - For Copilot, `/clear` also makes a new session (`sessionEnd user_exit`, then a `sessionStart` presumably with `source: "new"`). Whether `COPILOT_AGENT_SESSION_ID` follows it in later shell commands is undocumented and needs a check.
3. **Compaction and resume keep the id** on both CLIs (Claude Code inferred, Copilot inferred). `--fork-session` and `/branch` create new ids; the hook reports `source: "fork"` since 2.1.214.
4. **Choosing the id at launch is possible on both** (`--session-id <uuid>`). Dryland could write the index entry before the first hook fires, which removes a race at startup. It still needs hooks and the env var to follow later `/clear` ids. Never reuse a UUID: Claude's behaviour on a collision is undocumented, and Copilot would resume it.
5. **The Copilot adapter's session env var is `COPILOT_AGENT_SESSION_ID`** (since 1.0.29, changelog only). `parentSessionEnv` needs it so Dryland started from inside Copilot does not take the parent's id.
6. **Stripping `CLAUDE_CODE_CHILD_SESSION` is required for resume.** If Dryland runs inside a Claude Code session and passes it on, the sessions Dryland starts are left out of the picker and `--continue`, and are not persisted. `parentSessionEnv` already strips it; keep it that way.
7. **Subagents share their parent's `CLAUDE_CODE_SESSION_ID`** (verified). A `dryland ticket` call from a subagent is recorded against the parent session, which is what the ADR wants.
8. **Reconciliation from CLI history:**
   - *Claude Code:* the ADR holds. Listing `<config>/projects/<slug(worktree path)>/*.jsonl` gives ids and last-activity times per worktree without reading contents. Watch for the slug's undocumented hash past 200 characters, `CLAUDE_CONFIG_DIR`, and sessions moved with `/cd`.
   - *Copilot:* this **contradicts the ADR's assumption**. Copilot's documented store is not per directory, and mapping a session to the item's worktree means reading `events.jsonl` or `session-store.db`, whose formats are undocumented. For Copilot, reconciliation can only rebuild what the hooks recorded, unless Dryland accepts that format risk.
9. **Fallback chain:**
   - The Claude picker (`claude --resume` in the item's directory) is scoped to the current worktree, which fits.
   - The Copilot picker lists every session ranked by cwd; acceptable, but not scoped.
   - The ADR already rejects "continue newest". That matters even more for Copilot, whose `--continue` falls back to the globally newest session.
   - `claude -p --continue` with nothing to continue quietly starts fresh (verified), so a "continue" step can never be told apart from a fresh start by its exit code.
10. **Not verified:**
    - a live `/clear` run showing the Claude env var change (it is documented);
    - interactive `--continue` with no sessions, for both CLIs;
    - Claude `--session-id` with a UUID already in use;
    - everything about Copilot.
