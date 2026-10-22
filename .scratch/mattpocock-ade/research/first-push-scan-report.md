# First-push scan: secrets and personal data

Scanned for [mattpocock-ade/60](../issues/60-release-workflow-and-first-beta.md) before the history is pushed. Scope: every commit on every ref, and the current tree. The report names categories, files and counts, never the values found.

## Result

Nothing secret was found. Two kinds of non-secret material were found and removed, in the current tree and in the whole history, by rewriting it with `git filter-repo` (the history is kept commit by commit; only the commit hashes change, and the hashes cited in tickets were updated to match):

1. **A terms-of-service analysis of the Agent CLI providers.** It would go stale when a provider changes its terms, so it is not published. The topic is recorded as addressed and decided.
2. **The maintainer's local project folder path**, written about 210 times in the prototype's generated data, the prototype sources and the skills inventory. It is replaced with `<repo>`. The prototype data also held excerpts of real working sessions; the entries about the terms research were dropped.

## What was checked

| Check                                                                                                                             | Method                                                         | Result                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Secrets and tokens in history                                                                                                     | gitleaks (`zricethezav/gitleaks`, default rules, full history) | no leaks found in 437 commits                                                                                                         |
| Token prefixes (`gho_`, `ghp_`, `glpat-`)                                                                                         | `git log -S` over all refs                                     | 0 commits                                                                                                                             |
| Secret-like file names ever tracked (`.env`, `settings.local`, `.pem`, `.key`, `.p12`, `.pfx`, `id_rsa`, `credentials`, `.npmrc`) | `git log --name-only` over all refs                            | none, now or in history                                                                                                               |
| Author and committer identities                                                                                                   | `git log --format`                                             | one identity, a GitHub noreply address; no personal email                                                                             |
| Personal email addresses in diffs                                                                                                 | regex over all history                                         | none; the addresses found belong to authors of third-party packages, from the lockfile and `THIRD_PARTY_NOTICES.md`                   |
| Drive-letter and home paths in the tracked files                                                                                  | `grep` for `X:\` in single and doubled-backslash form          | after the rewrite only placeholders and test values remain (`C:\Tools`, `/home/dev`, `/Users/dev`, `C:\work\acme-billing`, and so on) |
| Windows account name                                                                                                              | `git log -S`                                                   | was in a test fixture of two commits; removed by the rewrite                                                                          |
| Binary files                                                                                                                      | list of tracked images and fonts                               | only the three app icons, about 70 KB together                                                                                        |

A first version of this scan missed the folder path in item 2, because the prototype data stores backslashes doubled and the search pattern did not. The search now covers both forms.

## Left as is, on purpose

- Test fixtures name a development folder of the old working name of the project (drive letter and folder). It is a folder name, not a personal one.
- Tickets 102, 103, 113 and 114 name two private throwaway repos under the maintainer's public account name.

## Not covered

- Private data in the meaning of `.scratch` prose, such as names of people or companies. The scan matched patterns, not meaning.
- The GitHub-side settings (secret scanning, push protection) of the new repo; enable them when the repo is created.
