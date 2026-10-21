# Changelog

All notable changes to Dryland ADE are listed here, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/). This file is edited by hand when a release is tagged.

## [Unreleased]

First public release is planned as `v0.1.0-beta.1` on the `beta` channel; `v1.0.0` follows once the manual smoke checklist passes.

### Added

- Desktop app with a tickets tree and a maps view over a repo's Matt Pocock skill artifacts, with the next step marked and explained.
- Embedded terminal sessions for Claude Code and GitHub Copilot CLI, started per ticket in its own git worktree, with live status from the Agent CLI's hooks, paused and resumable sessions, and a Sessions view.
- Explorer with file and diff tabs, Source Control, local merge and prune, and pull or merge requests through `gh` and `glab`.
- Local markdown, GitHub and GitLab trackers, shown in the app and written through the `dryland` CLI.
- Multiple open projects, a Settings dialog (General, Agent CLIs, Tracker, Skills, Write confirmations), and a Compatibility check of the repo's skill setup.
- The `dryland` CLI: `ticket`, `map`, `worktree`, `status` and `doctor` commands.
- LICENSE (MIT), third-party notices, README, user manual, contributing guide, code of conduct, security policy, issue forms, a PR template, and an About dialog.
