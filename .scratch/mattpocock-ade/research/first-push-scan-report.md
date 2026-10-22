# First-push scan: secrets and personal data

Scanned for [mattpocock-ade/60](../issues/60-release-workflow-and-first-beta.md) before the history is squashed to one "Initial commit" and pushed. Scope: all 437 commits on every ref, and the current tree. The report names categories, files and counts, never the values found.

## Result

Nothing blocks the push. Two items are worth a decision, both already harmless once history is squashed.

| Check                                                                                                                             | Method                                                         | Result                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Secrets and tokens in history                                                                                                     | gitleaks (`zricethezav/gitleaks`, default rules, full history) | no leaks found in 437 commits                                                                                                              |
| Token prefixes (`gho_`, `ghp_`, `glpat-`)                                                                                         | `git log -G` over all refs                                     | 0 commits                                                                                                                                  |
| Secret-like file names ever tracked (`.env`, `settings.local`, `.pem`, `.key`, `.p12`, `.pfx`, `id_rsa`, `credentials`, `.npmrc`) | `git log --name-only` over all refs                            | none, now or in history                                                                                                                    |
| Author and committer identities                                                                                                   | `git log --format`                                             | one identity, a GitHub noreply address; no personal email                                                                                  |
| Personal email addresses in diffs                                                                                                 | regex over all history                                         | none; the 10 addresses found belong to authors of third-party packages, from the lockfile and `THIRD_PARTY_NOTICES.md`                     |
| Local paths in the current tree (`C:\Users`, `T:\Development`, `/Users/`, `/home/`)                                               | `git grep`                                                     | only placeholders and test fixtures (`/home/dev`, `/home/u`, `/home/test`, `/Users/dev`, and `C:\Users\<YourUsername>` in a research note) |
| Windows account name in history                                                                                                   | `git log -G`                                                   | 2 commits (a test fixture added in one, replaced with a neutral name in the next); not in the current tree                                 |
| Binary files                                                                                                                      | list of tracked images and fonts                               | only the three app icons (`icon.png`, `icon.ico`, `icon.icns`), about 70 KB together                                                       |
| Large files                                                                                                                       | size ranking                                                   | the largest is a prototype data file of 310 KB; nothing near a size limit                                                                  |

## Decisions for the maintainer

1. **The account name in two historic commits.** It sits in a test fixture that a later commit neutralised. Squashing to one "Initial commit" removes it from the pushed history, so no further action is needed if the squash goes ahead as planned. If the squash were skipped, those two commits would need rewriting.
2. **Repo names added this session.** Tickets 102, 103, 113 and 114 name two private throwaway repos (a GitHub account name and project names). A public account name is not secret, but decide whether the pushed history should mention it; delete those lines before the squash if not.

## Not covered

- Private data in the content of `.scratch` prose, such as names of people or companies. The scan matched patterns, not meaning; a read-through of `.scratch/` is the human step before the push.
- The GitHub-side settings (secret scanning, push protection) of the new repo; enable them when the repo is created.
