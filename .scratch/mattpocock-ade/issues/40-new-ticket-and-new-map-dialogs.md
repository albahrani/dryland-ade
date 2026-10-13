# New ticket and New map dialogs

Type: task
Status: ready-for-agent
Blocked by: 31, 33, 39

Spec: [spec](../spec.md), user stories 19, 21, 22, 39. "UI". Layout detail: `prototype/views-and-ux/` (remaining screens).

## What to build

Three ways to add or continue work from the app:

- **New ticket.** A dialog with map, title, type, question and blocked-by. It previews the exact `dryland ticket create` command and runs it on confirmation (a confirmed write of the tracker-metadata type).
- **New map.** The user chooses only an Agent CLI. Dryland creates a temporary worktree and opens the CLI with `/wayfinder ` pre-typed, so the skill, not Dryland, authors the map.
- **Continue map.** The action on a map's stats card starts a session with `/wayfinder <map>` pre-typed.

Also the escape hatch: from a ticket or map the user can launch any installed skill instead of the recommended one, so Dryland never blocks them.

## Acceptance criteria

- [ ] The New ticket dialog shows the exact command it will run and updates the preview as fields change
- [ ] Confirming creates the ticket through `dryland`, and it appears in the tree under the chosen map
- [ ] The dialog honours the "do not ask again" flag for tracker metadata writes
- [ ] New map asks only for the Agent CLI, then opens it in a temporary worktree with `/wayfinder ` typed and not submitted
- [ ] Dryland itself writes no map file
- [ ] "Continue map" opens a session with `/wayfinder <map>` pre-typed
- [ ] From a ticket, the user can pick any installed skill and get its command pre-typed instead of the recommended one
