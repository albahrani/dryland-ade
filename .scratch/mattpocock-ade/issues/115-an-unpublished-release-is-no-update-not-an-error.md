# An unpublished release is no update, not an error

Type: task
Status: resolved

## Question

The Updates tab shows a long raw HTTP error (with headers and a stack trace) when the app asks GitHub for update information that is not published yet. Seen with the first beta: v0.1.0-beta.1 is a draft release, GitHub's public feed lists its tag, and downloading latest.yml from it returns 404, so electron-updater fails with ERR_UPDATER_CHANNEL_FILE_NOT_FOUND. The same happens with no release at all (ERR_UPDATER_LATEST_VERSION_NOT_FOUND, ERR_UPDATER_NO_PUBLISHED_VERSIONS, ERR_UPDATER_RELEASE_NOT_FOUND). Nothing published is the normal first state, on both the stable and the beta channel, and a draft must be invisible to the updater. Make createUpdater in packages/desktop/src/main/updates.ts treat those four codes as 'no update found' (status up-to-date), keep every other failure (network, a bad download) as a failed status, and say so in the code. Known limit: a release published without its update files would also read as up to date; the release workflow attaches them.

## Acceptance criteria

- [x] A check that finds no release, no published version, no such release, or a release without update files (a draft) ends as up to date on the stable and on the beta channel, with no error text
- [x] Any other failure of a check (a network error, a malformed answer) still ends as a failed status with its message
- [x] A failed download is still reported as failed
- [x] The installed beta, with the draft v0.1.0-beta.1 unpublished, shows up to date in the Updates tab on both channels

## Answer

createUpdater (packages/desktop/src/main/updates.ts) now reads 'nothing published' as up to date on both channels: ERR_UPDATER_CHANNEL_FILE_NOT_FOUND, ERR_UPDATER_LATEST_VERSION_NOT_FOUND, ERR_UPDATER_NO_PUBLISHED_VERSIONS and ERR_UPDATER_RELEASE_NOT_FOUND (4db9666). Running the packaged app showed the stable channel still failing: with only a draft listed in the releases feed, electron-updater wraps the inner 'Unable to find latest version on GitHub' error as ERR_UPDATER_INVALID_RELEASE_FEED. 334b5c6 treats that code as no update only when the message names that inner failure; a feed that truly cannot be parsed still fails. Other check failures and failed downloads still show as failed. Verified by hand in a packaged build with the draft v0.1.0-beta.1 unpublished: up to date on stable and beta. Known limits: a release published without update files also reads as up to date (the release workflow attaches them), and the wrapped-feed match depends on electron-updater's message text.
