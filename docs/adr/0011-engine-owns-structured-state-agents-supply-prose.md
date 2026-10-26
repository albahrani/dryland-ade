# The engine owns structured state; agents supply prose

Skills that write markdown files let agents write anything to them, so structure drifts, prose bloats, and the app cannot enforce claim-before-work, one resolve per session or human gates. Dryland becomes the source of truth for maps, fog, tickets and comments. One engine module in the pure core alone writes structured state: types, statuses, blocking edges, claims, revisions and the frontier. Agents run prompts and submit structured documents to `dryland` commands, with prose only inside the fields that hold it, and never touch a file path or a state file. The engine never calls a model.

Rejected: keeping `.scratch` markdown as truth with the app as a lens (agents can still write anything, and enforcement is impossible); an MCP server (every Agent CLI can already run a command, and an MCP server would not make the store unreachable).

## Decisions

- **Atomic commands**: every command is a compare-and-set within one repo and returns its write-time rejections and violation notices to the agent.
- **Ticket**: has a Report, an Analysis log, a Description and a Solution summary. Statuses are open, claimed and resolved only. The Report is fixed once claimed and edits to it are human-only. Resolved tickets change only by amend or reopen. Every edit appends a revision with time, author kind and reason.
- **Ticket fields**: type, status, a triage role (one of the five in `docs/agents/triage-labels.md`), acceptance criteria with ticks, blockers, the effort it belongs to (a slug; a map is an optional record on an effort, and a ticket on an effort without a map is standalone), an optional link to the effort's spec and a human-in-the-loop flag. Statuses stay open, claimed and resolved; the triage role is a separate field, not a status. The flag is set at creation and the gate below reads it.
- **Gates**: claim before work, one resolve per session (research excepted), blocking edges acyclic, a human-in-the-loop ticket resolves only after confirmation in the UI, Destination edits are human-only.
- **Caps and lint**: each field kind has a cap, and over-cap text is rejected with the cap stated, never truncated. Lint rejects hedges, filler, long sentences, file paths, line numbers and bare ids. Ballparks are in the rework spec; exact numbers are set during build.
- **Derived views**: the frontier, Decisions so far and the ticket kind and status are computed, never stored.
- **Prose files stay files**: `GLOSSARY.md`, ADRs and specs remain ordinary files merged by git.

## Consequences

- Supersedes ADR 0001 (the CLI as write path to files), ADR 0003 (write policy, annotations, skill-setup detection) and ADR 0009 (claim as an annotation). Lens mode, fingerprinting, per-feature compatibility judgements and the lock file go.
- The rule engine of ADR 0007 keeps its shape but reads engine state, not files.
