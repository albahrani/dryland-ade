# ADE writes metadata only, prose only as marked annotations, and degrades on modified skill setups

_Naming: the product is now Dryland ADE and the CLI binary is `dryland`; read `ade` in this ADR as `dryland`, the annotation marker as `<!-- dryland: ... -->` and the verdict file as `.dryland/compat.md`._

The ADE is a lens plus actuator, so its writes are narrow: tracker metadata through `ade` (claim, resolve, blocking, map index line, `Status:` and triage labels), each confirmed by a click unless the user started it from a ticket. Prose artifacts are not strictly off limits, because an ADE-owned addition may later improve UX or parsing. Any such **ADE-owned annotation** must be written through `ade`, delimited so skills ignore it (e.g. `<!-- ade: ... -->`), never alter skill-authored text, and be optional for every ADE feature. Each type is recorded as its own decision, and v1 ships none. A hard "never write prose" rule was rejected as too rigid; free-form content edits were rejected as coupling the ADE to skill details that change.

For non-default skill setups the ADE detects, warns and degrades; it never refuses or auto-repairs. Installed skills and `docs/agents/*.md` are fingerprinted against the default mirror on every startup. A modified setup prompts the user to run an agent-driven compatibility check (`ade doctor --compat-prompt`), skip, or accept the deviations. The resulting verdict file only toggles ADE features. Updating skills from the ADE is out of v1.

## Consequences

- Every write is auto-committed by pathspec, so `git log` is the audit trail and `git revert` the undo; there is no separate undo UI. The user can turn auto-commit off, globally or per project (spec story 61); writes then change files only, and the commit, audit trail and undo are theirs. The app passes its setting to every `dryland` call as `--commit` or `--no-commit`, so it wins over git's `dryland.autoCommit`.
- Confirmation prompts have per-type "do not ask again" flags in global settings. Clicking "Run check" or "Start" counts as consent to submit that pre-typed command.
- The verdict is a repo file (e.g. `.ade/compat.md`) tied to the skill fingerprint and invalidated when it changes. "Accept deviations" is stored per project against the deviation fingerprint.
- Without a verdict, the ADE falls back to routing only recognized artifacts and pre-typing only existing skills.
