# Security policy

## Reporting a vulnerability

Please report security problems privately, not in a public issue or discussion.

Use GitHub's private vulnerability reporting: open the **Security** tab of this repository and choose **Report a vulnerability**. Include what you found, the Dryland version (Help > About, or the release you installed), your OS, and the steps to reproduce it.

You can expect an acknowledgement within a week. Dryland is maintained by volunteers, so a fix may take longer; we will tell you what we plan and credit you in the release notes if you wish.

## Supported versions

Only the newest release on each update channel (`latest` and `beta`) receives fixes.

## What is in scope

Dryland runs on your machine with your permissions. These are the areas worth reporting:

- the `dryland` CLI and the app writing outside the repository you opened, or outside the Agent CLI config files documented in `docs/adr/0005-narrow-user-level-agent-config-writes.md`;
- the app running a command, or passing credentials, to a tracker (`gh`, `glab`) or an Agent CLI that the user did not ask for;
- a malicious repository (ticket, map or skill files) making Dryland execute code or read files it should not;
- the update mechanism installing something other than the project's releases.

Dryland does not call the Claude API and holds no account of its own. Problems in the Agent CLIs, `gh`, `glab` or Electron themselves belong to their projects, though we want to hear if Dryland makes one worse.

Builds are unsigned in version 1; see the README for what that means for installing.
