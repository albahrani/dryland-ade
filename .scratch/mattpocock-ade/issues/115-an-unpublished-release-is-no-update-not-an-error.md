# An unpublished release is no update, not an error

Type: task
Status: claimed
<!-- dryland: {"claim":{"holder":"main","at":"2026-10-22T18:40:36.958Z","was":""}} -->

## Question

The Updates tab shows a long raw HTTP error (with headers and a stack trace) when the app asks GitHub for update information that is not published yet. Seen with the first beta: v0.1.0-beta.1 is a draft release, GitHub's public feed lists its tag, and downloading latest.yml from it returns 404, so electron-updater fails with ERR_UPDATER_CHANNEL_FILE_NOT_FOUND. The same happens with no release at all (ERR_UPDATER_LATEST_VERSION_NOT_FOUND, ERR_UPDATER_NO_PUBLISHED_VERSIONS, ERR_UPDATER_RELEASE_NOT_FOUND). Nothing published is the normal first state, on both the stable and the beta channel, and a draft must be invisible to the updater. Make createUpdater in packages/desktop/src/main/updates.ts treat those four codes as 'no update found' (status up-to-date), keep every other failure (network, a bad download) as a failed status, and say so in the code. Known limit: a release published without its update files would also read as up to date; the release workflow attaches them.

## Acceptance criteria

- [ ] A check that finds no release, no published version, no such release, or a release without update files (a draft) ends as up to date on the stable and on the beta channel, with no error text
- [ ] Any other failure of a check (a network error, a malformed answer) still ends as a failed status with its message
- [ ] A failed download is still reported as failed
- [ ] The installed beta, with the draft v0.1.0-beta.1 unpublished, shows up to date in the Updates tab on both channels
