# Dryland ADE

An unofficial, community-made desktop agent development environment (ADE) for repos that use [Matt Pocock's skills](https://github.com/mattpocock/skills).

Dryland reads the artifacts those skills leave in a repo (maps, tickets, specs, the glossary, ADRs) and git state, shows what to do next, and starts Agent CLI sessions for you in an embedded terminal. It drives Claude Code and GitHub Copilot CLI through their own terminal programs and your own subscription login. It never calls the Claude API or the Agent SDK.

> **Dryland is not affiliated with or endorsed by Matt Pocock, Anthropic, GitHub or Orca.** It is a community project built to work with Matt Pocock's skills; the credit for those skills is his. Dryland is inspired by [Orca](https://github.com/stablyai/orca) (MIT) but is a fresh build; anything copied from it is attributed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

**Check the terms of your Agent CLI.** Dryland launches Claude Code and Copilot CLI the way you would in a terminal, but whether a given way of using them is allowed under your plan is set by their providers' terms, not by Dryland. Read them before you rely on this.

## What it does

- **Tickets and maps**: a tree of every map and ticket in the repo, with ready, in-progress, blocked and done states, and the next step marked with a gold bar and a star.
- **Sessions**: start a ticket's skill in Claude Code or Copilot CLI inside its own git worktree, see which sessions wait for you, and resume paused ones.
- **Explorer and Source Control**: browse files and diffs of the worktree you are looking at, and merge, prune or open a PR or MR when work is done.
- **The `dryland` CLI**: the ticket and map operations the skills call, for local markdown, GitHub and GitLab trackers.

See the [user manual](docs/manual/README.md) for the details.

## Install

Releases are on the GitHub Releases page of this repository: an NSIS installer for Windows (x64), DMG for macOS (arm64 and x64), AppImage and deb for Linux (x64). The first public builds are beta releases; the app can follow the `latest` or the `beta` channel.

You can also build it from source. You need Node 26 and pnpm:

```sh
pnpm install
pnpm build
pnpm --filter @dryland/desktop dev
```

## Unsigned builds

Dryland's builds are not signed in version 1, so your OS warns you the first time you start one. The warning is about the missing signature, not about anything found in the app.

**Windows (SmartScreen).** When "Windows protected your PC" appears, choose **More info**, then **Run anyway**.

**macOS (Gatekeeper).** If macOS says the app cannot be opened because it is from an unidentified developer, close the message, open **System Settings > Privacy & Security**, scroll to the message about Dryland and choose **Open Anyway**. Alternatively, Control-click the app in Finder and choose **Open**. Automatic updates do not work on macOS for unsigned apps; Dryland shows a link to a new version instead.

**Linux.** Make the AppImage executable (`chmod +x`) and run it, or install the deb with your package manager.

## About this repository

`.scratch/` is committed on purpose. It holds the maps, tickets, specs and research Dryland was designed with, using the same skills it is built for, so it doubles as design history and as the fixtures its parsers are tested against. `docs/adr/` holds the architecture decisions and `GLOSSARY.md` the project's vocabulary.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Report security problems privately, as described in [SECURITY.md](SECURITY.md). Everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Licence

MIT, see [LICENSE](LICENSE).
