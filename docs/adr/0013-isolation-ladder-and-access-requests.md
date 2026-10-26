# Agent sessions run under an isolation ladder, with access requests for exceptions

An agent that can run shell commands can also try to write the state store or read the user's secrets. State is unreachable by construction, and the user picks how strongly the rest is contained.

## Decisions

- **Levels**: Off (with a warning), Guarded (the default; the Agent CLI's own permission rules plus the engine's checks) and Contained (the Agent CLI runs in Docker, mounting only the session's worktree). Guarded is weaker than Contained; the doctor reports what is enforced per OS and CLI. microVMs are a later level.
- **State**: tracker state writes are denied at every level except through `dryland` commands. In Contained, state is outside the mount.
- **Session token**: each session gets a token tied to one ticket, so it cannot act on other tickets.
- **Profile**: derived from ticket type: worktree writes plus a per-type extra. The starting brief holds only the map, the own ticket and the answers of its blockers.
- **Secrets**: scrubbed environment, home credential paths denied, forge tokens held by the engine.
- **Access request**: an agent asks, with a required reason, for access its profile denies. Answers: deny, deny and never ask, allow once, allow for the session, allow always. Unattended sessions pre-approve extras at launch; a denial ends the agent as blocked, without workarounds.
- **Rule store**: one store, translated into each Agent CLI's native rules, so the user sees one prompt. A settings screen lists and revokes rules. A repo layer can only narrow.
- **Violation**: a caught bypass is reverted from the log, recorded as a violation event and reported to the agent. A second violation pauses the session.

## Consequences

- **Open: state outside the mount.** In Contained a worktree's `.git` file points at the common dir outside the mount, so git does not work in the container, and mounting the common dir would expose the state ref. Guarded has the matching problem: the ref is writable from a linked worktree. How git runs in both levels with state unwritable is decided by the prototype in dryland-rework ticket 39, and this ADR is amended with the result.

- Narrow user-level config writes (ADR 0005) remain allowed; its consent flags survive.
- Deny lists, profile contents and rule translation are set during build.
