## Agent skills

### Issue tracker

Issues and specs are local markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `GLOSSARY.md` plus `docs/adr/`. See `docs/agents/domain.md`.

## Closing a ticket

Implementing a ticket does not close it. Once its work is committed, resolve it the way `docs/agents/issue-tracker.md` defines "Resolve":

1. `dryland ticket tick <map>/<NN> --criterion <n>` for every acceptance criterion the code and tests cover; leave unticked any they do not.
2. `dryland ticket resolve <map>/<NN> --answer "<what was built, the commits, decisions, known limits>"`.
3. `dryland map index <map> --title "<title>" --link issues/<NN>-<slug>.md --gist "<one sentence>"`.
4. Commit the ticket and map files as their own commit, separate from the code.

The ticket is closed when its `Status:` is `resolved`, it holds an `## Answer`, and the map links it. Run `dryland` from `node packages/cli/dist/dryland.mjs` after `pnpm build` unless it is on `PATH`.

## Testing on Windows

CI runs Linux, macOS and Windows, but a Windows machine hides POSIX-only failures (executable bits, hooks, `#!/bin/sh` stubs). On Windows with Docker running, run the full suite twice before committing: `pnpm test`, then `pnpm test:linux` (the suite in a throwaway `node` container on a copy of the working tree). Fix failures from either run. Without Docker, say so and leave the Linux run to CI.

After a change that touches the desktop app (`packages/desktop`), also run the Playwright tests: `pnpm --filter @dryland/desktop test:e2e` natively, then `pnpm test:e2e:linux` (Electron under Xvfb in a throwaway container).

### Disk space on Windows

Both Linux scripts only `docker run` a stock `node` image, so they leave no Docker build cache; a large cache comes from other builds. Each test run keeps its temp folders in one `dryland-run-*` directory and deletes it at the end; only a killed run leaves one behind in `%TEMP%`, safe to delete. Never make a test crash a process on purpose: under WSL the kernel writes the whole process memory to `%TEMP%\wsl-crashes`, about 680 MB per crash, and `ulimit -c 0` does not stop it. If the disk fills anyway, `docker system df` shows what Docker holds and `docker builder prune` clears the cache. Docker Desktop can keep its disk image on another drive (Settings, Resources, Advanced, Disk image location), and compacting `docker_data.vhdx` is what returns the space to the drive.

## Editing files

Create files with the Write tool and change them with the Edit tool. For a batch of replacements across files, or a regex replacement, Write a JSON spec and run `node scripts/edit.mjs <spec.json> [--dry-run]`; the spec format is in the script's header. For any other one-off script, Write it to the scratchpad and run `node <file>`. Verify a scripted change with Grep.
