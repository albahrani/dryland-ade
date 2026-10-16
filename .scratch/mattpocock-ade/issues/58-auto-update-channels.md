# Auto-update channels

Type: task
Status: ready-for-agent
Blocked by: 55, 57

Spec: [spec](../spec.md), user stories 91 to 93. "Lifecycle, packaging and release". ADR 0004.

## What to build

Updates through `electron-updater` from GitHub Releases, with two channels: `latest` (default) and `beta`. Dryland checks at most once a day plus on demand. An update is downloaded in the background and applied on next quit, so updating never interrupts a session.

Auto-update works on Windows NSIS and Linux AppImage. macOS and deb are notify-only: an "update available" notice with a link.

The Updates tab of Settings shows the current version, the channel choice, the last check, a "check now" action and the state of a pending update.

## Acceptance criteria

- [ ] The Updates tab shows version, channel, last check and pending-update state, and "check now" works
- [ ] Switching the channel changes which releases are considered
- [ ] No more than one automatic check happens per day
- [ ] On NSIS and AppImage, a found update downloads in the background and installs on next quit, never while the app runs
- [ ] On macOS and deb, a found update shows a notice with a link and nothing is downloaded
- [ ] A failed check or download is reported quietly and does not disturb running sessions
- [ ] Update decisions (channel, daily limit, per-platform behaviour) are tested with a fake update source

## Comments

From mattpocock-ade/41 (bc47448): every quit now goes through before-quit in packages/desktop/src/main/index.ts, which prevents it while sessions run, asks, then stops them and calls app.quit() again with quit set to 'allowed'. Install-on-quit must follow that path: hook the install after the confirmation and the shutdown steps, or call quitAndInstall only once quit is allowed, so an update never skips the question or kills sessions unasked.
