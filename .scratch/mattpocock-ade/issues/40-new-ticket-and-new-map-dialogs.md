# New ticket and New map dialogs

Type: task
Status: resolved
Blocked by: 31, 33, 39

Spec: [spec](../spec.md), user stories 19, 21, 22, 39. "UI". Layout detail: `prototype/views-and-ux/` (remaining screens).

## What to build

Three ways to add or continue work from the app:

- **New ticket.** A dialog with map, title, type, question and blocked-by. It previews the exact `dryland ticket create` command and runs it on confirmation (a confirmed write of the tracker-metadata type).
- **New map.** The user chooses only an Agent CLI. Dryland creates a temporary worktree and opens the CLI with `/wayfinder ` pre-typed, so the skill, not Dryland, authors the map.
- **Continue map.** The action on a map's stats card starts a session with `/wayfinder <map>` pre-typed.

Also the escape hatch: from a ticket or map the user can launch any installed skill instead of the recommended one, so Dryland never blocks them.

## Acceptance criteria

- [x] The New ticket dialog shows the exact command it will run and updates the preview as fields change
- [x] Confirming creates the ticket through `dryland`, and it appears in the tree under the chosen map
- [x] The dialog honours the "do not ask again" flag for tracker metadata writes
- [x] New map asks only for the Agent CLI, then opens it in a temporary worktree with `/wayfinder ` typed and not submitted
- [x] Dryland itself writes no map file
- [x] "Continue map" opens a session with `/wayfinder <map>` pre-typed
- [x] From a ticket, the user can pick any installed skill and get its command pre-typed instead of the recommended one

## Answer

Built in a6c8530. New ticket: a dialog (map, title, type, question, blocked-by checkboxes of the map's open tickets) previews the exact dryland ticket create command as fields change; Create goes through the tracker-metadata confirmation, so the do-not-ask-again flag applies. Opened from File > New Ticket... (Ctrl+N) or the + in the Tickets view. New map: File > New Map... (Ctrl+Shift+M) or the + in the Maps view; only the Agent CLI is chosen, it opens in a fresh new-map/scratch-wayfinder worktree (collision-suffixed) with /wayfinder typed, never submitted; Dryland writes no map file. Continue map: on the stats card and on a map's tab, opens <map>/scratch-wayfinder (reused if on disk, new core worktreeForScratch) with /wayfinder <map> typed; it claims nothing. Any skill: ticket and map tabs offer a Skill picker listing installed skills (new adapter field skillDirs, Claude Code: .claude/skills in the project and in the home dir; core installedSkills); the pick types /<skill> <map>/<NN> or /<skill> <map>, and main refuses a skill that is not installed. Decisions: SessionInfo.ticket is now nullable with a new map field, so map sessions show on no ticket; the new-map effort name is a placeholder until the skill names the map. Known limits: plugin-provided skills are not listed; the Linux test runs were not done locally (Docker not running), left to CI.
