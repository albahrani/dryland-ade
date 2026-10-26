# The engine owns structured state; agents supply prose

Skills that write markdown files let agents write anything to them, so structure drifts, prose bloats, and the app cannot enforce claim-before-work, one resolve per session or human gates. Dryland becomes the source of truth for maps, fog, tickets and comments. One engine module in the pure core alone writes structured state: types, statuses, blocking edges, claims, revisions and the frontier. Agents run prompts and supply prose through `dryland` commands, with text on stdin, and never touch a file path or a state file. The engine never calls a model.

Rejected: keeping `.scratch` markdown as truth with the app as a lens (agents can still write anything, and enforcement is impossible); an MCP server (every Agent CLI can already run a command, and an MCP server would not make the store unreachable).

## Decisions

- **Atomic commands**: every command is a compare-and-set within one repo and returns its write-time rejections and violation notices to the agent.
- **Ticket**: has a Report, an Analysis log, a Description and a Solution summary. Statuses are open, claimed and resolved only. The Report is fixed once claimed and edits to it are human-only. Resolved tickets change only by amend or reopen. Every edit appends a revision with time, author kind and reason.
- **Gates**: claim before work, one resolve per session (research excepted), blocking edges acyclic, a human-in-the-loop ticket resolves only after confirmation in the UI, Destination edits are human-only.
- **Caps and lint**: each field kind has a cap, and over-cap text is rejected with the cap stated, never truncated. Lint rejects hedges, filler, long sentences, file paths, line numbers and bare ids. Ballparks are in the rework spec; exact numbers are set during build.
- **Derived views**: the frontier, Decisions so far and the ticket kind and status are computed, never stored.
- **Prose files stay files**: `GLOSSARY.md`, ADRs and specs remain ordinary files merged by git.

## Consequences

- Supersedes ADR 0001 (the CLI as write path to files), ADR 0003 (write policy, annotations, skill-setup detection) and ADR 0009 (claim as an annotation). Lens mode, fingerprinting, per-feature compatibility judgements and the lock file go.
- The rule engine of ADR 0007 keeps its shape but reads engine state, not files.
