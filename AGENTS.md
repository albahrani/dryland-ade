## Agent skills

### Issue tracker

Issues and specs are local markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `GLOSSARY.md` plus `docs/adr/`. See `docs/agents/domain.md`.

## Closing a ticket

Implementing a ticket does not close it. Once its work is committed, resolve it the way `docs/agents/issue-tracker.md` defines "Resolve":

1. Tick every acceptance criterion the code and tests cover, and leave unticked any they do not.
2. `dryland ticket resolve <map>/<NN> --answer "<what was built, the commits, decisions, known limits>"`.
3. `dryland map index <map> --title "<title>" --link issues/<NN>-<slug>.md --gist "<one sentence>"`.
4. Commit the ticket and map files as their own commit, separate from the code.

The ticket is closed when its `Status:` is `resolved`, it holds an `## Answer`, and the map links it. Run `dryland` from `node packages/cli/dist/dryland.mjs` after `pnpm build` unless it is on `PATH`.
